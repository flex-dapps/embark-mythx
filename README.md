Status Embark plugin for MythX.

# QuickStart

Run `verify` in the Embark console. When the call returns, it will look something like this:

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

# Options

