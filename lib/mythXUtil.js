'use strict';

const armlet = require('armlet')
const fs = require('fs')
const util = require('util');
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

    //console.log("contractObjects", JSON.stringify(contractObjects))

    let allContracts = [];

    Object.keys(contractObjects.contracts).forEach(function(fileKey, index) {
        const contractFile = contractObjects.contracts[fileKey];
        const sources = contractObjects.sources[fileKey];
        // Read source code from file
        const source = fs.readFileSync(fileKey, 'utf8')

        //console.log("source", source)


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

            //console.log("comes out", contract)
            allContracts = allContracts.concat(contract);
        });
    });

    return allContracts;
};

const truffle2MythXJSON = function(truffleJSON, toolId = 'embark-mythx') {
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

    sourceMap = srcmap.zeroedSourceMap(sourceMap);
    deployedSourceMap = srcmap.zeroedSourceMap(deployedSourceMap);

    const mythXJSON = {
        contractName,
        bytecode,
        deployedBytecode,
        sourceMap,
        deployedSourceMap,
        sourceList: [ sourcesKey ],
        sources: {
            [sourcesKey]: {
                source,
                ast,
                legacyAST,
            },
        },
        mainSource: sourcesKey,
        toolId
    }

    //console.log("mythXJSON", JSON.stringify(mythXJSON))
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

module.exports = {
    remapMythXOutput,
    truffle2MythXJSON,
    buildRequestData,
    getNotFoundContracts,
    getFoundContractNames,
    getContractFiles,
    cleanAnalyzeDataEmptyProps
}