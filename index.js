const mythx = require('./mythx')
const commandLineArgs = require('command-line-args')

module.exports = function(embark) {

	let contracts;

	// Register for compilation results
	embark.events.on("contracts:compiled:solc", (res) => {
		//console.log("contracts:compiled:solc", JSON.stringify(res));
		contracts = res;
	});

	embark.registerConsoleCommand({
		description: "Run MythX analysis",
		matches: (cmd) => { 
			//embark.logger.info('cmd', cmd)
			const cmdName = cmd.match(/".*?"|\S+/g)
			//embark.logger.info("cmdName", cmdName)
			//embark.logger.info('cmdName.length === 1', cmdName.length === 1)
			//embark.logger.info("eh?")
			return (Array.isArray(cmdName) && 
					cmdName[0] === 'verify' && 
					cmdName[1] != 'help' && 
					cmdName[1] != 'status' && 
					cmdName.length >= 1)
		},
		usage: "verify [options]",
		process: async (cmd, callback) => {
			//embark.logger.info("cmd", cmd)
			//embark.logger.info("verifying...")

			const cmdName = cmd.match(/".*?"|\S+/g)
			// Remove first element, as we know it's the command
			cmdName.shift()

			//embark.logger.info("embark.logger", JSON.stringify(embark.logger))

			//console.log("option object", JSON.stringify({ "argv": cmdName }))
			let cfg = parseOptions({ "argv": cmdName })

			//embark.logger.info('cmd', cmdName)
			//embark.logger.info('cfg', JSON.stringify(cfg))

			try {
				embark.logger.info("Running MythX analysis in background.")
		        const returnCode = await mythx.analyse(contracts, cfg, embark)
		        //embark.logger.info("result", result)
		        
		        if (returnCode === 0) {
		            return callback(null, "MythX analysis found no vulnerabilities.")
		        } else if (returnCode === 1) {
		            return callback("MythX analysis found vulnerabilities!", null)
		        } else if (returnCode === 2) {
		            return callback("Internal MythX error encountered.", null)
		        } else { 
		            return callback(new Error("\nUnexpected Error: return value of `analyze` should be either 0 or 1."), null)
		        }
		    } catch (e) {
		    	embark.logger.error("error", e)
		        return callback(e, "ERR: " + e.message)
		    }
		}
	})

	embark.registerConsoleCommand({
		description: "Help",
		matches: (cmd) => { 
			//embark.logger.info('cmd', cmd)
			const cmdName = cmd.match(/".*?"|\S+/g)
			//embark.logger.info('cmdName', cmdName)
			//embark.logger.info("cmdName[0] === 'verify' && cmdName[1] === 'help'", cmdName[0] === 'verify' && cmdName[1] === 'help')
			return (Array.isArray(cmdName) &&
					(cmdName[0] === 'verify' && 
					cmdName[1] === 'help'))
		},
		usage: "verify help",
		process: (cmd, callback) => {
			embark.logger.info("verify help running")
			return callback(null, help())
		}
	})

	function help() {
		return (
			"Usage: ...\n" +
			"\n" + 
			"Commands:\n" + 
			"\thelp\t\tThis help."
		)
	}

	embark.registerConsoleCommand({
		description: "Check MythX analysis status",
		matches: (cmd) => { 
			//embark.logger.info('cmd', cmd)
			const cmdName = cmd.match(/".*?"|\S+/g)
			//embark.logger.info("cmdName", cmdName)
			//embark.logger.info('cmdName.length === 1', cmdName.length === 1)
			return (Array.isArray(cmdName) && 
					cmdName[0] === 'verify' && 
					cmdName[1] == 'status' && 
					cmdName.length == 3)
		},
		usage: "verify status <uuid>",
		process: async (cmd, callback) => {
			//embark.logger.info("verify status running")
			//embark.logger.info("embark.logger", JSON.stringify(embark.logger))

			const cmdName = cmd.match(/".*?"|\S+/g)

			//embark.logger.info('cmd', cmd)
			//embark.logger.info('cfg', JSON.stringify(cfg))
			try {
		        const returnCode = await mythx.getStatus(cmdName[2], embark)
		        //embark.logger.info("result", result)
		        
		        if (returnCode === 0) {
		            return callback(null, "returnCode: " + returnCode)
		        } else if (returnCode === 1) {
		        	//embark.logger.error("MythX analysis found vulnerabilities.")
		        	//TODO: Fix reporting
		            return callback()
		        } else {
		        	//TODO: Figure out how to use error with callback properly. 
		            return callback(new Error("Unexpected Error: return value of `analyze` should be either 0 or 1."), null)
		        }
		        
		    } catch (e) {
		    	embark.logger.error("error", e)
		        return callback(e, "ERR: " + e.message)
		    }
		}
	})

	function parseOptions(options) {

		//console.log("options", JSON.stringify(options))

		const optionDefinitions = [
			{ name: 'full', alias: 'f', type: Boolean },
			{ name: 'debug', alias: 'd', type: Boolean },
			{ name: 'no-cache-lookup', alias: 'c', type: Boolean },
			{ name: 'limit', alias: 'l', type: Number },
			{ name: 'initial-delay', alias: 'i', type: Number },
			{ name: 'contracts', type: String, multiple: true, defaultOption: true }
		]

		const parsed = commandLineArgs(optionDefinitions, options)

		//console.log("parsed", JSON.stringify(parsed))
		//console.log("parsed.contracts", parsed.contracts)
		//console.log("parsed.full", parsed.full)	

		if(parsed.full) {
			parsed.analysisMode = "full"
		} else {
			parsed.analysisMode = "full"
		}

		return parsed
	}
}