'use strict';

const armlet = require('armlet')
const fs = require('fs')
const util = require('util');
const srcmap = require('./srcmap');

const getContractFiles = directory => {
    let files = fs.readdirSync(directory)
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

    const { sources, compiler } = contractObjects;
    let allContracts = [];

    const allSources = Object.entries(sources).reduce((accum, [sourcePath, data]) => {
        const source = fs.readFileSync(sourcePath, 'utf8')
        const { ast, legacyAST } = data;
        const key = path.basename(sourcePath);
        accum[key] = { ast, legacyAST, source };
        return accum;
    }, {});

    Object.keys(contractObjects.contracts).forEach(function(fileKey, index) {
        const contractFile = contractObjects.contracts[fileKey];

        Object.keys(contractFile).forEach(function(contractKey, index) {
            const contractJSON = contractFile[contractKey]
            const contract = {
                contractName: contractKey,
                bytecode: contractJSON.evm.bytecode.object,
                deployedBytecode: contractJSON.evm.deployedBytecode.object,
                sourceMap: contractJSON.evm.bytecode.sourceMap,
                deployedSourceMap: contractJSON.evm.deployedBytecode.sourceMap,
                sources: allSources,
                sourcePath: fileKey
            };

            allContracts = allContracts.concat(contract);
        });
    });

    return allContracts;
};

const embark2MythXJSON = function(embarkJSON, toolId = 'embark-mythx') {
    let {
        contractName,
        bytecode,
        deployedBytecode,
        sourceMap,
        deployedSourceMap,
        sourcePath,
        sources
    } = embarkJSON;

    const sourcesKey = path.basename(sourcePath);

    let sourceList = [];
    for(let key in sources) {
        sourceList.push(sources[key].ast.absolutePath);
    }

    const mythXJSON = {
        contractName,
        bytecode,
        deployedBytecode,
        sourceMap,
        deployedSourceMap,
        mainSource: sourcesKey,
        sourceList: sourceList,
        sources,
        toolId
    }

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
        logger.debug(`${props.contractName}: Empty JSON data fields from compilation - ${unusedFields.join(', ')}`);
    }

    return result;
}

module.exports = {
    remapMythXOutput,
    embark2MythXJSON,
    buildRequestData,
    getNotFoundContracts,
    getFoundContractNames,
    getContractFiles,
    cleanAnalyzeDataEmptyProps
}