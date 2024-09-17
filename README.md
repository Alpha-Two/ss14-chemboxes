To use the program, install the dependencies and clone space-wizards/space-station-14 into ./space-station-14, then run node

you can either run commands headless by editing the `commandArray` variable in index.js, or you can manually input them when prompted.

`g` takes one mandatory argument, `-y`, which specifies the YAML file to take the data from (for example, `g -y medicine`)
- TODO fix a bug that crashes the program if one tries to load 2 files in one session
- TODO make `-y` optional and make the default loading every single file
- TODO replace `-y` with `-r` and `-R` to specify reagent and reaction files respectively

`o` takes the next argument and outputs the required data for a Manual Chem Box template. (for example, `o Dylovene`)

- TODO make all current YAML files actually work
  - DONE `medicine` and `botany` (but not at the same time ffs)
- TODO fix current commands
- TODO make it headless by taking arguments from the actual commandline
- TODO integrate with MediaWiki
- TODO set up an action for it
