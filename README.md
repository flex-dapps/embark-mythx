![Running MythX analyses in Status Embark](https://cdn-images-1.medium.com/max/960/1*7jwHRc5J152bz704Fg7iug.png)

# Status Embark plugin for MythX.

This plugin brings MythX to Status Embark. Simply call `verify` from the Embark console and `embark-mythx` sends your contracts off for analysis. It is inspired by `truffle-security` and uses its source mapping and reporting functions.

## QuickStart

0. Create a `.env` file in the root of your project and provide your MythX login information. If omitted, MythX will run in trial mode.

```json
MYTHX_ETH_ADDRESS="<mythx-address>"
MYTHX_PASSWORD="<password>"
```

1. Run `verify [options] [contracts]` in the Embark console. When the call returns, it will look something like this:

```bash
Embark (development) > verify
embark-mythx: Running MythX analysis in background.
embark-mythx: Submitting 'ERC20' for analysis...
embark-mythx: Submitting 'SafeMath' for analysis...
embark-mythx: Submitting 'Ownable' for analysis...

embark-mythx: 
/home/flex/mythx-plugin/testToken/.embark/contracts/ERC20.sol
  1:0  warning  A floating pragma is set  SWC-103

✖ 1 problem (0 errors, 1 warning)

embark-mythx: MythX analysis found vulnerabilities.
```

## Installation

Add `embark-mythx` to the `plugins` section of your `embark.json` file. To have the plugin permanently ignore one or multiple contracts, add them to the configuration:

```json
"plugins": {
  "embark-mythx": {
    "ignore": ["Ownable", "Migrations"]
  }
}
``` 

## Usage

```bash
verify [--full] [--debug] [--no-cache-lookup] [--limit] [--initial-delay] [<contracts>]
verify status <uuid>
verify help

Options:
	--full			Perform full instead of quick analysis.
	--debug			Additional debug output.
	--no-cache-lookup	Skip MythX-side cache lookup of report.
	--limit			Maximum number of concurrent analyses.
	--initial-delay		Time in seconds before first analysis status check.

	[<contracts>]		List of contracts to submit for analysis (default: all).
	status <uuid>		Retrieve analysis status for given MythX UUID.
	help			This help.

```

### Example Usage

```bash
# Quick analysis on all contracts in project
> verify

# 'ERC20' and 'Ownable' full analysis
> verify ERC20 Ownable --full

# Check status of previous or ongoing analysis
> verify status ef5bb083-c57a-41b0-97c1-c14a54617812
```