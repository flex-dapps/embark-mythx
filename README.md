![Running MythX analyses in Status Embark](https://cdn-images-1.medium.com/max/960/1*7jwHRc5J152bz704Fg7iug.png)

[![GitHub license](https://img.shields.io/github/license/flex-dapps/embark-mythx.svg)](https://github.com/flex-dapps/embark-mythx/blob/master/LICENSE)
![npm](https://img.shields.io/npm/v/embark-mythx.svg)

# Status Embark plugin for MythX.

This plugin brings MythX to Status Embark. Simply call `verify` from the Embark console and `embark-mythx` sends your contracts off for analysis. It is inspired by `truffle-security` and uses its source mapping and reporting functions.

## QuickStart

1. Create a `.env` file in the root of your project and provide your MythX login information. Free MythX accounts can be created at https://dashboard.mythx.io/#/registration.

```json
MYTHX_USERNAME="<mythx-username>"
MYTHX_PASSWORD="<password>"
```

> **NOTE:** `MYTHX_ETH_ADDRESS` has been deprecated in favour of `MYTHX_USERNAME` and will be removed in future versions. Please update your .env file or your environment variables accordingly. 

`MYTHX_USERNAME` may be either of:
* MythX User ID (assigned by MythX API to any registered user);
* Ethereum address, if user account is associated with an address;
* A verified email address, if the user account is associated with an email address, and that address has been verified by visiting the verification link in the verification email sent by the MythX API each time when user email is set or modified in the MythX settings.

For more information, please see the [MythX API Login documentation](https://api.mythx.io/v1/openapi#operation/login).

2. Run `verify [options] [contracts]` in the Embark console. When the call returns, it will look something like this:

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

0. Install this plugin from the root of your Embark project:

```bash
$ npm i embark-mythx
# or
$ npm i flex-dapps/embark-mythx
```

1. Add `embark-mythx` to the `plugins` section of your `embark.json` file. To have the plugin permanently ignore one or multiple contracts, add them to the configuration:

```json
"plugins": {
  "embark-mythx": {
    "ignore": ["Ownable", "Migrations"]
  }
}
``` 

## Usage

```bash
verify [--full] [--debug] [--limit] [--initial-delay] [<contracts>]
verify status <uuid>
verify help

Options:
	--full, -f		Perform full instead of quick analysis (not available on free MythX tier).
	--debug, -d		Additional debug output.
	--limit, -l		Maximum number of concurrent analyses.
	--initial-delay, -i	Time in seconds before first analysis status check.

	[<contracts>]		List of contracts to submit for analysis (default: all).
	status <uuid>		Retrieve analysis status for given MythX UUID.
	help			This help.

```

### Example Usage

```bash
# Quick analysis on all contracts in project
$ verify

# 'ERC20' and 'Ownable' full analysis
$ verify ERC20 Ownable --full

# Check status of previous or ongoing analysis
$ verify status ef5bb083-c57a-41b0-97c1-c14a54617812
```