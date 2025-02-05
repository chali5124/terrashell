terraform backend configuration 과 docker 내 일관된 자동화를 위한 cli commander

### Install
```
npm install -g @chali5124/terrashell
```

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


### Project Environment
아래와 같이 프로젝트 리포지토리를 구성한 것으로 판단함
```
├─ app/
├─ infra/
├─ docker/
└─ package.json
```

TERRASHELL_GITHUB_ACCESS_TOKEN
- 프로젝트 리포지토리가 GITHUB에 있는 경우, environment에 TERRASHELL_GITHUB_ACCESS_TOKEN을 설정해야 함
