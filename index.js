const mythx = require('./mythx')

module.exports = function(embark) {

	embark.registerConsoleCommand({
		description: "Run MythX analysis",
		matches: (cmd) => { 
			embark.logger.info('cmd', cmd)
			const cmdName = cmd.match(/".*?"|\S+/g)
			embark.logger.info("cmd === 'verify': " + cmd === 'verify')
			//embark.logger.info('cmdName.length === 1', cmdName.length === 1)
			return (cmd === 'verify' && cmdName.length === 1)
		},
		usage: "verify [options]",
		process: async (cmd, callback) => {

			//embark.logger.info("embark.logger", JSON.stringify(embark.logger))

			let cfg = parseOptions(cmd)
			embark.logger.info('cmd', cmd)
			embark.logger.info('cfg', JSON.stringify(cfg))
			try {
				embark.logger.info("verify process")
		        const result = await mythx(cfg, embark)
		        embark.logger.info("result", result)
		        /*
		        if (returnCode === 0) {
		            return callback(null, "returnCode: " + returnCode)
		        } else if (returnCode === 1) {
		        	embark.logger.error("Analysis returned with exit code 1.")
		            return callback()
		        } else {
		        	//TODO: Figure out how to use error with callback properly. 
		            return callback(new Error("Unexpected Error: return value of `analyze` should be either 0 or 1."), null)
		        }
		        */
		    } catch (e) {
		    	embark.logger.error("error", e)
		        return callback(e, "ERR: " + e.message)
		    }
		}
	})

	embark.registerConsoleCommand({
		description: "Help",
		matches: (cmd) => { 
			embark.logger.info('cmd', cmd)
			const cmdName = cmd.match(/".*?"|\S+/g)
			embark.logger.info('cmdName', cmdName)
			//embark.logger.info("cmdName[0] === 'verify' && cmdName[1] === 'help'", cmdName[0] === 'verify' && cmdName[1] === 'help')
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
			"Usage: ...\n" +
			"\n" + 
			"Commands:\n" + 
			"\thelp\t\tThis help."
		)
	}

	function parseOptions(options) {
		let config = {}
		//TODO
		return config
	}
}