require('dotenv').config()

const armlet = require('armlet')
const fs = require('fs')
const yaml = require('js-yaml');
const mythXUtil = require('./lib/mythXUtil');
const asyncPool = require('tiny-async-pool');
const { MythXIssues, doReport } = require('./lib/issues2eslint');

const defaultConcurrentAnalyses = 4

async function analyse(contracts, cfg, embark) {

    cfg.logger = embark.logger

    // Set analysis parameters
    const limit = cfg.limit || defaultConcurrentAnalyses

    if (isNaN(limit)) {
        embark.logger.info(`limit parameter should be a number; got ${limit}.`)
        return 1
    }
    if (limit < 0 || limit > defaultConcurrentAnalyses) {
        embark.logger.info(`limit should be between 0 and ${defaultConcurrentAnalyses}.`)
        return 1
    }

    if (process.env.MYTHX_ETH_ADDRESS) {
        process.env.MYTHX_USERNAME = process.env.MYTHX_ETH_ADDRESS;
        embark.logger.warn("The environment variable MYTHX_ETH_ADDRESS in favour of MYTHX_USERNAME and will be removed in future versions. Please update your .env file or your environment variables accordingly.");
    }

    // Connect to MythX via armlet
    if(!process.env.MYTHX_USERNAME || !process.env.MYTHX_PASSWORD) {
        throw new Error("Environment variables 'MYTHX_USERNAME' and 'MYTHX_PASSWORD' not found. Place these in a .env file in the root of your &ETH;App, add them in the CLI command, ie 'MYTHX_USERNAME=xyz MYTHX_PASSWORD=123 embark run', or add them to your system's environment variables.");
    }

    const armletClient = new armlet.Client(
    {
        clientToolName: "embark-mythx",
        password: process.env.MYTHX_PASSWORD,
        ethAddress: process.env.MYTHX_USERNAME,
    })
    
    // Filter contracts based on parameter choice
    let toSubmit = { "contracts": {}, "sources": contracts.sources };
    if(!("ignore" in embark.pluginConfig)) {
        embark.pluginConfig.ignore = []
    }

    for (let [filename, contractObjects] of Object.entries(contracts.contracts)) {
        for (let [contractName, contract] of Object.entries(contractObjects)) {
            if(!("contracts" in cfg)) {
                if (embark.pluginConfig.ignore.indexOf(contractName) == -1) {
                    if(!toSubmit.contracts[filename]) {
                        toSubmit.contracts[filename] = {}
                    }
                    toSubmit.contracts[filename][contractName] = contract;
                }
            } else {
                if (cfg.contracts.indexOf(contractName) >= 0 && embark.pluginConfig.ignore.indexOf(contractName) == -1) {
                    if(!toSubmit.contracts[filename]) {
                        toSubmit.contracts[filename] = {}
                    }
                    toSubmit.contracts[filename][contractName] = contract;
                }
            }
        }
    }
    
    // Stop here if no contracts are left
    if(Object.keys(toSubmit.contracts).length === 0) {
        embark.logger.info("No contracts to submit.");
        return 0;
    }

    const submitObjects = mythXUtil.buildRequestData(toSubmit)
    const { objects, errors } = await doAnalysis(armletClient, cfg, submitObjects, null, limit)

    const result = doReport(cfg, objects, errors)
    return result
}

async function getStatus(uuid, embark) {

    // Connect to MythX via armlet
    const armletClient = new armlet.Client(
    {
        clientToolName: "embark-mythx",
        password: process.env.MYTHX_PASSWORD,
        ethAddress: process.env.MYTHX_USERNAME,
    })
    
    try {
        const results = await armletClient.getIssues(uuid);
        return ghettoReport(embark.logger, results);
    } catch (err) {
        embark.logger.warn(err);
        return 1;
    }
}

const doAnalysis = async (armletClient, config, contracts, contractNames = null, limit) => {

    const timeout = (config.timeout || 300) * 1000;
    const initialDelay = ('initial-delay' in config) ? config['initial-delay'] * 1000 : undefined;

    const results = await asyncPool(limit, contracts, async buildObj => {
        
        const obj = new MythXIssues(buildObj, config);

        let analyzeOpts = {
            clientToolName: 'embark-mythx',
            timeout,
            initialDelay
        };

        analyzeOpts.data = mythXUtil.cleanAnalyzeDataEmptyProps(obj.buildObj, config.debug, config.logger.debug);
        analyzeOpts.data.analysisMode = config.full ? "full" : "quick";
        if (config.debug > 1) {
            config.logger.debug("analyzeOpts: " + `${util.inspect(analyzeOpts, {depth: null})}`);
        }

        // request analysis to armlet.
        try {
            //TODO: Call analyze/analyzeWithStatus asynchronously
            config.logger.info("Submitting '" + obj.contractName + "' for " + analyzeOpts.data.analysisMode + " analysis...")
            const {issues, status} = await armletClient.analyzeWithStatus(analyzeOpts);
            obj.uuid = status.uuid;

            if (status.status === 'Error') {
                return [status, null];
            } else {
                obj.setIssues(issues);
            }
            
            return [null, obj];
        } catch (err) {
            //console.log("catch", JSON.stringify(err));
            let errStr;
            if (typeof err === 'string') {
                errStr = `${err}`;
            } else if (typeof err.message === 'string') {
                errStr = err.message;
            } else {
                errStr = `${util.inspect(err)}`;
            }

            if (errStr.includes('User or default timeout reached after')
               || errStr.includes('Timeout reached after')) {
                return [(buildObj.contractName + ": ").yellow + errStr, null];
            } else {
                return [(buildObj.contractName + ": ").red + errStr, null];

            }
        }
    });

    return results.reduce((accum, curr) => {
        const [ err, obj ] = curr;
        if (err) {
            accum.errors.push(err);
        } else if (obj) {
            accum.objects.push(obj);
        }
        return accum;
    }, { errors: [], objects: [] });
};

function ghettoReport(logger, results) {
    let issuesCount = 0;
    results.forEach(ele => {
        issuesCount += ele.issues.length;
    });
    
    if (issuesCount === 0) {
        logger.info('No issues found');
        return 0;
    }
    for (const group of results) {
        logger.info(group.sourceList.join(', ').underline);
        for (const issue of group.issues) {
            logger.info(yaml.safeDump(issue, {'skipInvalid': true}));
        }
    }
    return 1;
}

module.exports = {
    analyse,
    getStatus
}