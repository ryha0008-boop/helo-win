# Commands

All CLI commands reference. Run `helo --help` for the full list.

```
helo                                          # interactive mode (no args)
helo add <name> [options]                     # create a blueprint
helo list [--json]                            # list blueprints
helo run [name] [--resume [id]] [-- ...]      # launch agent
helo remove <name>                            # delete a blueprint
helo key <name> <key>                         # set/update API key
helo keys set <provider> <key>                # set global key
helo keys remove <provider>                   # remove global key
helo keys list                                # list global keys
helo defaults set <runtime> <path>            # set default settings
helo defaults show <runtime>                  # show defaults
helo templates list                           # list CLAUDE.md templates
helo templates show <name>                    # print template
helo templates init                           # write templates to config dir
helo status [--json]                          # config path + key status
helo clean <runtime> [--yes]                  # remove runtime global dir
```
