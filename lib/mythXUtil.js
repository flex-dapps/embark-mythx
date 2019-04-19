'use strict';

const armlet = require('armlet')
const fs = require('fs')
const util = require('util');
const eslintHelpers = require('./eslint');
const srcmap = require('./srcmap');

const getContractFiles = directory => {
    let files = fs.readdirSync(directory)
    console.log("files", files)
    files = files.filter(f => f !== "ENSRegistry.json" && f !== "FIFSRegistrar.json" && f !== "Resolver.json");
    return files.map(f => path.join(directory, f))
};

function getFoundContractNames(contracts, contractNames) {
    let foundContractNames = [];
    contracts.forEach(({ contractName }) => {
        if (contractNames && contractNames.indexOf(contractName) < 0) {
            return;
        }
        foundContractNames.push(contractName);
    });
    return foundContractNames;
}

const getNotFoundContracts = (allContractNames, foundContracts) => {
    if (allContractNames) {
        return allContractNames.filter(function(i) {return foundContracts.indexOf(i) < 0;});
    } else {
        return [];
    }
}

const buildRequestData = contractObjects => {

    console.log("contractObjects", JSON.stringify(contractObjects))

    let allContracts = [];

    Object.keys(contractObjects.contracts).forEach(function(fileKey, index) {
        const contractFile = contractObjects.contracts[fileKey];
        const sources = contractObjects.sources[fileKey];
        // Read source code from file
        const source = fs.readFileSync(fileKey, 'utf8')

        console.log("source", source)


        Object.keys(contractFile).forEach(function(contractKey, index) {
            const contractJSON = contractFile[contractKey]
            //console.log("goes in", [sourcePath, data])
            const contract = {
                contractName: contractKey,
                bytecode: contractJSON.evm.bytecode.object,
                deployedBytecode: contractJSON.evm.deployedBytecode.object,
                sourceMap: contractJSON.evm.bytecode.sourceMap,
                deployedSourceMap: contractJSON.evm.deployedBytecode.sourceMap,
                ast: sources.ast,
                legacyAST: sources.legacyAST,
                sourcePath: fileKey,
                source: source
            };

            console.log("comes out", contract)
            allContracts = allContracts.concat(contract);
        });
    });


    /*
    // Remove possible duplicates
    const uniqueContracts = {};
    allContracts.forEach(contract => {
        console.log("contract.contractName", contract.contractName)
        console.log("contract", JSON.stringify(contract))
        if (!uniqueContracts[contract.contractName]) {
            uniqueContracts[contract.contractName] = contract
        }
    })

    
    console.log("allContracts without duplicates", JSON.stringify(uniqueContracts))
    */

    /*
    let requestData = [];

    for(const contractName in uniqueContracts) {

        const contract = uniqueContracts[contractName]
        console.log(contract.className, contract)

        const source = fs.readFileSync(contract.filename, 'utf8')

        console.log("source", source)

        const newContract = {
            contractName: contract.className,
            bytecode: contract.runtimeBytecode,
            deployedBytecode: contract.realRuntimeBytecode,
            //sources: {}
        }
        //newContract.sources[contract.filename] = { "source": source }

        console.log("comes out", newContract)
        requestData = requestData.concat(newContract);
    }
    */

    return allContracts;
};

// Take truffle's build/contracts/xxx.json JSON and make it
// compatible with the Mythril Platform API
const truffle2MythXJSON = function(truffleJSON, toolId = 'truffle-security') {
    let {
        contractName,
        bytecode,
        deployedBytecode,
        sourceMap,
        deployedSourceMap,
        sourcePath,
        source,
        legacyAST,
        ast
    } = truffleJSON;

    const sourcesKey = path.basename(sourcePath);

    // FIXME: why do we only one sourcePath in sourceList?
    // We shouldn't be zeroing this but instead correcting sourceList to
    // have the multiple entries.
    sourceMap = srcmap.zeroedSourceMap(sourceMap);
    deployedSourceMap = srcmap.zeroedSourceMap(deployedSourceMap);

    const mythXJSON = {
        contractName,
        bytecode,
        deployedBytecode,
        sourceMap,
        deployedSourceMap,
        sourceList: [ sourcePath ],
        sources: {
            [sourcesKey]: {
                source,
                ast,
                legacyAST,
            },
        },
        toolId
    }

    console.log("mythXJSON", mythXJSON)
    return mythXJSON;
};

const remapMythXOutput = mythObject => {
    const mapped = mythObject.sourceList.map(source => ({
        source,
        sourceType: mythObject.sourceType,
        sourceFormat: mythObject.sourceFormat,
        issues: [],
    }));

    if (mythObject.issues) {
        mythObject.issues.forEach(issue => {
            issue.locations.forEach(({ sourceMap }) => {
                let sourceListIndex = sourceMap.split(':')[2];
                if (sourceListIndex === -1) {
                    // FIXME: We need to decide where to attach issues
                    // that don't have any file associated with them.
                    // For now we'll pick 0 which is probably the main starting point
                    sourceListIndex = 0;
                }
                mapped[0].issues.push({
                    swcID: issue.swcID,
                    swcTitle: issue.swcTitle,
                    description: issue.description,
                    extra: issue.extra,
                    severity: issue.severity,
                    sourceMap,
                });
            });
        });
    }

    return mapped;
};

const cleanAnalyzeDataEmptyProps = (data, debug, logger) => {
    const { bytecode, deployedBytecode, sourceMap, deployedSourceMap, ...props } = data;
    const result = { ...props };

    const unusedFields = [];

    if (bytecode && bytecode !== '0x') {
        result.bytecode = bytecode;
    } else {
        unusedFields.push('bytecode');
    }

    if (deployedBytecode && deployedBytecode !== '0x') {
        result.deployedBytecode = deployedBytecode;
    } else {
        unusedFields.push('deployedBytecode');
    }

    if (sourceMap) {
        result.sourceMap = sourceMap;
    } else {
        unusedFields.push('sourceMap');
    }

    if (deployedSourceMap) {
        result.deployedSourceMap = deployedSourceMap;
    } else {
        unusedFields.push('deployedSourceMap');
    }

    if (debug && unusedFields.length > 0) {
        logger(`${props.contractName}: Empty JSON data fields from compilation - ${unusedFields.join(', ')}`);
    }

    return result;
}

function doReport(config, objects, errors, notAnalyzedContracts) {
    let ret = 0;

    // Return true if we shold show log.
    // Ignore logs with log.level "info" unless the "debug" flag
    // has been set.
    function showLog(log) {
        return config.debug || (log.level !== 'info');
    }

    // Return 1 if some vulenrabilities were found.
    objects.forEach(ele => {
        ele.issues.forEach(ele => {
            ret = ele.issues.length > 0 ? 1 : ret;
        })
    })

    if (config.yaml) {
        config.logger.info("config.yaml", config.yaml)
        const yamlDumpObjects = objects;
        for(let i = 0; i < yamlDumpObjects.length; i++) {
          delete yamlDumpObjects[i].logger;
        }
        config.logger.info(yaml.safeDump(yamlDumpObjects, {'skipInvalid': true}));
    } else if (config.json) {
        config.logger.info("config.json", config.json)
        config.logger.info(JSON.stringify(objects, null, 4));
    } else {
        config.logger.info("else", "else")
        const spaceLimited = ['tap', 'markdown', 'json'].indexOf(config.style) === -1;
        const eslintIssues = objects
            .map(obj => obj.getEslintIssues(config, spaceLimited))
            .reduce((acc, curr) => acc.concat(curr), []);

        // FIXME: temporary solution until backend will return correct filepath and output.
        const eslintIssuesByBaseName = groupEslintIssuesByBasename(eslintIssues);

        const uniqueIssues = eslintHelpers.getUniqueIssues(eslintIssuesByBaseName);

        console.log("uniqueIssues", JSON.stringify(uniqueIssues))

        console.log("config.style", config.style)
        const formatter = getFormatter(config.style);

        config.logger.info("config.logger", JSON.stringify(config.logger))
        const report = formatter(uniqueIssues);
        console.log("report", report)
        config.logger.info(report);
    }

    const logGroups = objects.map(obj => { return {'sourcePath': obj.sourcePath, 'logs': obj.logs, 'uuid': obj.uuid};})
          .reduce((acc, curr) => acc.concat(curr), []);

    let haveLogs = false;
    logGroups.some(logGroup => {
        logGroup.logs.some(log => {
            if (showLog(log)) {
                haveLogs = true;
                return;
            }
        });
        if(haveLogs) return;
    });

    if (haveLogs) {
        ret = 1;
        config.logger.info('MythX Logs:'.yellow);
        logGroups.forEach(logGroup => {
            config.logger.info(`\n${logGroup.sourcePath}`.yellow);
            config.logger.info(`UUID: ${logGroup.uuid}`.yellow);
            logGroup.logs.forEach(log => {
                if (showLog(log)) {
                    config.logger.info(`${log.level}: ${log.msg}`);
                }
            });
        });
    }

    if (errors.length > 0) {
        ret = 1;
        console.error('Internal MythX errors encountered:'.red);
        errors.forEach(err => {
            console.error(err.error || err);
            if (config.debug > 1 && err.stack) {
                config.logger.info(err.stack);
            }
        });
    }

    return ret;
}

function getFormatter(style) {
    const formatterName = style || 'stylish';
    try {
        const frmtr = require(`eslint/lib/formatters/${formatterName}`);
        return frmtr
    } catch (ex) {
        ex.message = `\nThere was a problem loading formatter option: ${style} \nError: ${
            ex.message
        }`;
        throw ex;
    }
}

const groupEslintIssuesByBasename = issues => {
    const path = require('path');
    const mappedIssues = issues.reduce((accum, issue) => {
        const {
            errorCount,
            warningCount,
            fixableErrorCount,
            fixableWarningCount,
            filePath,
            messages,
        } = issue;

        const basename = path.basename(filePath);
        if (!accum[basename]) {
            accum[basename] = {
                errorCount: 0,
                warningCount: 0,
                fixableErrorCount: 0,
                fixableWarningCount: 0,
                filePath: filePath,
                messages: [],
            };
        }
        accum[basename].errorCount += errorCount;
        accum[basename].warningCount += warningCount;
        accum[basename].fixableErrorCount += fixableErrorCount;
        accum[basename].fixableWarningCount += fixableWarningCount;
        accum[basename].messages = accum[basename].messages.concat(messages);
        return accum;
    }, {});

    const issueGroups = Object.values(mappedIssues);
    for (const group of issueGroups) {
        group.messages = group.messages.sort(function(mess1, mess2) {
            return compareMessLCRange(mess1, mess2);
        });

    }
    return issueGroups;
};

function compareMessLCRange(mess1, mess2) {
    const c = compareLineCol(mess1.line, mess1.column, mess2.line, mess2.column);
    return c != 0 ? c : compareLineCol(mess1.endLine, mess1.endCol, mess2.endLine, mess2.endCol);
}

function compareLineCol(line1, column1, line2, column2) {
    return line1 === line2 ?
        (column1 - column2) :
        (line1 - line2);
}

module.exports = {
    remapMythXOutput,
    truffle2MythXJSON,
    buildRequestData,
    getNotFoundContracts,
    getFoundContractNames,
    getContractFiles,
    cleanAnalyzeDataEmptyProps,
    doReport
}