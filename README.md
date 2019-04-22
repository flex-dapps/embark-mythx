Status Embark plugin for MythX.

# QuickStart

Run `verify [options] [contracts]` in the Embark console. When the call returns, it will look something like this:

```
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

# Installation

Add `embark-mythx` to the `plugins` section in your `embark.json`. To have the plugin permanently ignore one or multiple contracts, add them as array `ignore` to the configuration:

```
"plugins": {
  "embark-mythx": {
    "ignore": ["Ownable", "Migrations"]
  }
}
``` 

# Parameters

`contracts` (optional) -- List of contracts to submit. 


# Options

`--full`, `-f` -- run full analysis instead of quick.
`--debug`, `-d` -- print additional output.
`no-cache-lookup`, `-c` -- Resubmit contracts, ignore cached results.
`limit`, `-l` -- Number of analyses submitted at a time.
`initial-delay`, `-i` -- Time before first status request.