# Commands

All CLI commands reference. Run `helo --help` for the full list.

```
helo                                              # interactive mode (no args)
helo init                                         # first-time setup wizard
helo add <name> [options]                         # create a blueprint
helo list [--json]                                # list blueprints
helo run [name] [--resume [id]] [-p <prompt>] [-- ...]
helo edit <name> [--runtime] [--provider] [--model] [--api-key] [--claude-md]
helo remove <name>                                # delete a blueprint
helo key <name> <key>                             # set/update blueprint API key
helo keys set <provider> <key>                    # set global key
helo keys remove <provider>                       # remove global key
helo keys list                                    # list global keys
helo templates list                               # list CLAUDE.md templates
helo templates show <name>                        # print template
helo templates init                               # write templates to config dir
helo status [--json]                              # config path + key status
helo clean [name] [--global <runtime>] [--yes]    # remove env dirs or global runtime dir
helo runtime install <runtime>                    # install a runtime
helo runtime uninstall <runtime>                  # uninstall a runtime
helo runtime list                                 # show installed runtimes
helo update                                       # self-update from GitHub releases
helo sessions [name]                              # list conversation sessions (id, date, size)
```
