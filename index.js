const mythx = require('./mythx')
const commandLineArgs = require('command-line-args')

module.exports = function(embark) {

	let contracts;

	// Register for compilation results
	embark.events.on("contracts:compiled:solc", (res) => {
		contracts = res;
	});

	embark.registerConsoleCommand({
		description: "Run MythX analysis",
		matches: (cmd) => { 
			const cmdName = cmd.match(/".*?"|\S+/g)
			return (Array.isArray(cmdName) && 
					cmdName[0] === 'verify' && 
					cmdName[1] != 'help' && 
					cmdName[1] != 'status' && 
					cmdName.length >= 1)
		},
		usage: "verify [options] [contracts]",
		process: async (cmd, callback) => {

			const cmdName = cmd.match(/".*?"|\S+/g)
			// Remove first element, as we know it's the command
			cmdName.shift()

			let cfg = parseOptions({ "argv": cmdName })

			try {
				embark.logger.info("Running MythX analysis in background.")
		        const returnCode = await mythx.analyse(contracts, cfg, embark)
		        
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
		        return callback(e, "ERR: " + e.message)
		    }
		}
	})

	embark.registerConsoleCommand({
		description: "Help",
		matches: (cmd) => { 
			const cmdName = cmd.match(/".*?"|\S+/g)
			return (Array.isArray(cmdName) &&
					(cmdName[0] === 'verify' && 
					cmdName[1] === 'help'))
		},
		usage: "verify help",
		process: (cmd, callback) => {
			return callback(null, help())
		}
	})

	function help() {
		return (
			"Usage:\n" +
			"\tverify [--full] [--debug] [--limit] [--initial-delay] [<contracts>]\n" +
			"\tverify status <uuid>\n" +
			"\tverify help\n" +
			"\n" + 
			"Options:\n" + 
			"\t--full, -f\t\t\tPerform full rather than quick analysis.\n" + 
			"\t--debug, -d\t\t\tAdditional debug output.\n" + 
			"\t--limit, -l\t\t\tMaximum number of concurrent analyses.\n" + 
			"\t--initial-delay, -i\t\tTime in seconds before first analysis status check.\n" + 
			"\n" + 
			"\t[<contracts>]\t\t\tList of contracts to submit for analysis (default: all).\n" + 
			"\tstatus <uuid>\t\t\tRetrieve analysis status for given MythX UUID.\n" + 
			"\thelp\t\t\t\tThis help.\n"
		)
	}

	embark.registerConsoleCommand({
		description: "Check MythX analysis status",
		matches: (cmd) => { 
			const cmdName = cmd.match(/".*?"|\S+/g)
			return (Array.isArray(cmdName) && 
					cmdName[0] === 'verify' && 
					cmdName[1] == 'status' && 
					cmdName.length == 3)
		},
		usage: "verify status <uuid>",
		process: async (cmd, callback) => {
			const cmdName = cmd.match(/".*?"|\S+/g)

			try {
		        const returnCode = await mythx.getStatus(cmdName[2], embark)
		        
		        if (returnCode === 0) {
		            return callback(null, "returnCode: " + returnCode)
		        } else if (returnCode === 1) {
		            return callback()
		        } else {
		            return callback(new Error("Unexpected Error: return value of `analyze` should be either 0 or 1."), null)
		        }
		    } catch (e) {
		        return callback(e, "ERR: " + e.message)
		    }
		}
	})

	function parseOptions(options) {
		const optionDefinitions = [
			{ name: 'full', alias: 'f', type: Boolean },
			{ name: 'debug', alias: 'd', type: Boolean },
			{ name: 'limit', alias: 'l', type: Number },
			{ name: 'initial-delay', alias: 'i', type: Number },
			{ name: 'contracts', type: String, multiple: true, defaultOption: true }
		]

		const parsed = commandLineArgs(optionDefinitions, options)

		if(parsed.full) {
			parsed.analysisMode = "full"
		} else {
			parsed.analysisMode = "quick"
		}

		return parsed
	}
}