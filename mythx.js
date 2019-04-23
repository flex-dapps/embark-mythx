require('dotenv').config()

const armlet = require('armlet')
const fs = require('fs')
const yaml = require('js-yaml');
const mythXUtil = require('./lib/mythXUtil');
const asyncPool = require('tiny-async-pool');
const { MythXIssues, doReport } = require('./lib/issues2eslint');

const defaultAnalyzeRateLimit = 4

async function analyse(contracts, cfg, embark) {

    //embark.logger.debug("embark.config", embark.config)

    //console.log("embark.logger", embark.logger)
    //console.log("JSON.stringify(embark.logger)", JSON.stringify(embark.logger))
    //embark.logger.info("typeof embark.logger", typeof embark.logger)
    cfg.logger = embark.logger
    //embark.logger.info("embark", JSON.stringify(embark))

    // Set analysis parameters
    const limit = cfg.limit || defaultAnalyzeRateLimit

    if (isNaN(limit)) {
        embark.logger.info(`limit parameter should be a number; got ${limit}.`)
        return 1
    }
    if (limit < 0 || limit > defaultAnalyzeRateLimit) {
        embark.logger.info(`limit should be between 0 and ${defaultAnalyzeRateLimit}; got ${limit}.`)
        return 1
    }

    // Connect to MythX via armlet
    const armletClient = new armlet.Client(
    {
        clientToolName: "embark-mythx",
        password: process.env.MYTHX_PASSWORD,
        ethAddress: process.env.MYTHX_ETH_ADDRESS,
    })
    

    //Check contract names provided in options are respected
    //embark.logger.info("contracts", contracts)
    embark.logger.info("cfg.contracts", cfg.contracts)

    //console.log("embark.pluginConfig.ignore", embark.pluginConfig.ignore)
    // Filter contracts based on parameter choice

    let toSubmit = { "contracts": {}, "sources": contracts.sources };
    if(!("ignore" in embark.pluginConfig)) {
        embark.pluginConfig.ignore = []
    }

    console.log("embark.pluginConfig.ignore", JSON.stringify(embark.pluginConfig.ignore))
    //console.log("cfg.contracts", cfg.contracts)
    for (let [filename, contractObjects] of Object.entries(contracts.contracts)) {
        for (let [contractName, contract] of Object.entries(contractObjects)) {
            if(!("contracts" in cfg)) {
                if (embark.pluginConfig.ignore.indexOf(contractName) == -1) {
                    //console.log("Adding to submit", contractName, contractObjects)
                    if(!toSubmit.contracts[filename]) {
                        toSubmit.contracts[filename] = {}
                        //toSubmit.sources[filename] = contracts.sources[filename]
                    }
                    toSubmit.contracts[filename][contractName] = contract;
                }
            } else {
                if (cfg.contracts.indexOf(contractName) >= 0 && embark.pluginConfig.ignore.indexOf(contractName) == -1) {
                    //console.log("Adding to submit", contractName, contractObjects)
                    if(!toSubmit.contracts[filename]) {
                        toSubmit.contracts[filename] = {}
                        //toSubmit.sources[filename] = contracts.sources[filename]
                    }
                    toSubmit.contracts[filename][contractName] = contract;
                }
            }
        }
    }
    
    //console.log("toSubmit", JSON.stringify(toSubmit))
    //console.log("contracts", JSON.stringify(contracts))

    // Stop here if no contracts are left
    if(Object.keys(toSubmit.contracts).length === 0) {
        embark.logger.info("No contracts to submit.");
        return 0;
    }

    //embark.logger.info("toSubmit", toSubmit)
    const submitObjects = mythXUtil.buildRequestData(toSubmit)

    console.log("submitObjects", JSON.stringify(submitObjects))

    //return 0
    const { objects, errors } = await doAnalysis(armletClient, cfg, submitObjects, null, limit)

    //console.log("objects", JSON.stringify(objects))
    //embark.logger.info("errors", errors)

    const result = doReport(cfg, objects, errors)
    //embark.logger.info("result", result)
    return result
}

async function getStatus(uuid, embark) {

    //embark.logger.debug("embark.config", embark.config)

    //console.log("embark.logger", embark.logger)
    //console.log("JSON.stringify(embark.logger)", JSON.stringify(embark.logger))
    //embark.logger.info("typeof embark.logger", typeof embark.logger)

    // Connect to MythX via armlet
    const armletClient = new armlet.Client(
    {
        clientToolName: "embark-mythx",
        password: process.env.MYTHX_PASSWORD,
        ethAddress: process.env.MYTHX_ETH_ADDRESS,
    })
    
    try {
        const results = await armletClient.getIssues(uuid);
        return ghettoReport(embark.logger.info, results);
    } catch (err) {
        embark.logger.warn(err);
        return 1;
    }
}

const doAnalysis = async (armletClient, config, contracts, contractNames = null, limit) => {

    //config.logger.info("\ncontracts", contracts)

    const timeout = (config.timeout || 300) * 1000;
    const initialDelay = ('initial-delay' in config) ? config['initial-delay'] * 1000 : undefined;
    const noCacheLookup = ('no-cache-lookup' in config) ? config['no-cache-lookup'] : true;

    const results = await asyncPool(limit, contracts, async buildObj => {
        
        const obj = new MythXIssues(buildObj, config);

        let analyzeOpts = {
            clientToolName: 'embark-mythx',
            noCacheLookup,
            timeout,
            initialDelay
        };

        console.log("obj", JSON.stringify(obj))

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

            console.log("uuid", obj.uuid)

            if (status.status === 'Error') {
                return [status, null];
            } else {
                obj.setIssues(issues);
            }
            
            return [null, obj];
        } catch (err) {
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

    //console.log("results", JSON.stringify(results))

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
        logger('No issues found');
        return 0;
    }
    for (const group of results) {
        logger(group.sourceList.join(', ').underline);
        for (const issue of group.issues) {
            logger(yaml.safeDump(issue, {'skipInvalid': true}));
        }
    }
    return 1;
}

module.exports = {
    analyse,
    getStatus
}