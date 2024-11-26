terrashell
===
테라폼 Command Shell

## Overview
### Requirements
1. terraform version
    - 1.5.0 이상
2. commander
    - 12.1.0

### Usage
```

Usage: terrashell <function> [options]

terraform cli v0.0.1

Arguments:
  func                          실행할 함수
  command                       optional 실행할 명령

Options:
  -V, --version                 output the version number
  -ne, --no_environment         environment 설정 없이 진행시
  -d, --debug                   validate with detail message
  -l, --with_link               run with build_link for serverless
  -b, --with_build              run with build for serverless
  -m, --init_with_migrate       init with migrate
  -rc, --init_with_reconfigure  init with reconfigure
  -u, --init_with_upgrade       init with upgrade
  -ds, --plan_with_destroy      plan with destroy
  -h, --help                    display help for command
```