require('dotenv').config()

const armlet = require('armlet')
const fs = require('fs')
const mythXUtil = require('./lib/mythXUtil');
const asyncPool = require('tiny-async-pool');
const { MythXIssues } = require('./lib/issues2eslint');

const defaultAnalyzeRateLimit = 4

module.exports = async function analyse(contracts, cfg, embark) {

    //embark.logger.debug("embark.config", embark.config)
    cfg.logger = embark.logger
    //embark.logger.info("embark", JSON.stringify(embark))

    // Set analysis parameters
    const limit = cfg.limit || defaultAnalyzeRateLimit

    if (isNaN(limit)) {
        console.log(`limit parameter should be a number; got ${limit}.`)
        return 1
    }
    if (limit < 0 || limit > defaultAnalyzeRateLimit) {
        console.log(`limit should be between 0 and ${defaultAnalyzeRateLimit}; got ${limit}.`)
        return 1
    }

    // Connect to MythX via armlet
    const armletClient = new armlet.Client(
    {
        clientToolName: "embark-mythx",
        password: process.env.MYTHX_PASSWORD,
        ethAddress: process.env.MYTHX_ETH_ADDRESS,
    })
    

    //TODO: Check contract names provided in options are respected
    //const contractNames = cfg._.length > 1 ? cfg._.slice(1, cfg._.length) : null

    // Collect contracts ---
    
    // Extract list of contracts passed in cli to verify

    /*
    // Get list of JSON smart contract files from build directory
    console.log("embark.config.embarkConfig.generationDir", embark.config.buildDir)
    const contractFiles = mythXUtil.getContractFiles(embark.config.buildDir + "/contracts")

    embark.logger.debug("contractFiles", contractFiles)

    // Parse contracts
    
    let contractObjects = contractFiles.map(filename => {
        const jsonFile = fs.readFileSync(filename, 'utf8')
        //console.log("contract object", jsonFile)
        return JSON.parse(jsonFile)
    })
    */

    console.log("contracts", contracts)

    //TODO: Possibly need to rewrite the contract objects for MythX to understand

    const submitObjects = mythXUtil.buildRequestData(contracts)

    const { objects, errors } = await doAnalysis(armletClient, cfg, submitObjects, limit)

    //console.log("objects", JSON.stringify(objects))
    console.log("errors", errors)

    const result = mythXUtil.doReport(cfg, objects, errors)
    console.log("result", result)
    return result
}

const doAnalysis = async (armletClient, config, contracts, contractNames = null, limit) => {

    console.log("\ncontracts", contracts)

    const timeout = (config.timeout || 300) * 1000;
    const initialDelay = ('initial-delay' in config) ? config['initial-delay'] * 1000 : undefined;
    const cacheLookup = ('cache-lookup' in config) ? config['cache-lookup'] : true;

    const results = await asyncPool(limit, contracts, async buildObj => {
        
        const obj = new MythXIssues(buildObj, config);

        let analyzeOpts = {
            clientToolName: 'embark-mythx',
            noCacheLookup: !cacheLookup,
            timeout,
            initialDelay
        };

        analyzeOpts.data = mythXUtil.cleanAnalyzeDataEmptyProps(obj.buildObj, config.debug, config.logger.debug);
        analyzeOpts.data.analysisMode = analyzeOpts.mode || 'quick';
        if (config.debug > 1) {
            config.logger.debug("analyzeOpts: " + `${util.inspect(analyzeOpts, {depth: null})}`);
        }

        // request analysis to armlet.
        try {
            console.log("analyzeOpts", JSON.stringify(analyzeOpts))
            const {issues, status} = await armletClient.analyzeWithStatus(analyzeOpts);
            obj.uuid = status.uuid;
            if (config.debug) {
                config.logger.debug(`${analyzeOpts.data.contractName}: UUID is ${status.uuid}`);
                if (config.debug > 1) {
                    config.logger.debug("issues: " + `${util.inspect(issues, {depth: null})}`);
                    config.logger.debug("status: " + `${util.inspect(status, {depth: null})}`);
                }
            }

            if (status.status === 'Error') {
                return [status, null];
            } else {
                obj.setIssues(issues);
            }
            return [null, obj];
        } catch (err) {
            let errStr;
            if (typeof err === 'string') {
                // It is assumed that err should be string here.
                errStr = `${err}`;
            } else if (typeof err.message === 'string') {
                // If err is Error, get message property.
                errStr = err.message;
            } else {
                // If err is unexpected type, coerce err to inspectable format.
                // This situation itself is not assumed, but this is for robustness and investigation.
                errStr = `${util.inspect(err)}`;
            }

            // Check error message from armlet to determine if a timeout occurred.
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
