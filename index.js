#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fetch } = require("undici");
const { execFile, execFileSync, spawn, spawnSync } = require("child_process");
const { Command } = require("commander");
const program = new Command();

// 실행위치가 infra 이하이므로
const packageJsonTerrashell = require("./package.json"); // terrashell package.

// terrashell 로컬버전
const env = {
  // RUNTIME_APP_NAME: packageJson.name,  // 현재 처리중인 application 명
  // RUNTIME_APP_VERSION: packageJson.version, // 현재 처리중인 version 명
  RUNTIME_APP_ENV_VARS: "APP_ENV_VARS", // github에서 container에 추가할 environment variables를 조회할 변수명

  RUNTIME_PLATFORM: os.platform(),
  RUNTIME_RELEASE: os.release(),
  RUNTIME_HOSTNAME: os.hostname(),
  RUNTIME_NOW: new Date(),
  RUNTIME_ENVIRONMENT: "default", // terraform의 기본 워크스페이스
  RUNTIME_REQUEST_FUNCTION: "", // 실행할 함수명

  TF_APP_NAME: packageJsonTerrashell.name, // 현재 처리중인 terrashell repo 명
  TF_APP_VERSION: packageJsonTerrashell.version, // 현재 처리중인 terrashell version 명
  TF_APP_SHELLNAME: "terrashell", //
  TF_NOTIFICATION_SNS_ARN: "", // SNS arn
  TF_STATE_BUCKET: "terrashell-backend",
  TF_STATE_KEY: `terrashell.tfstate`,
  TF_STATE_REGION: "ap-northeast-2",
  TF_STATE_ENCRYPT: true,
  TF_STATE_DYNAMODB: "terrashell-backend",
};

const utils = {
  setGitToken: (token) => {
    fs.writeFile(".terrashell", token, (err) => {
      if (err) {
        console.error(err);
      } else {
        // file written successfully
        console.info("github access token is saved!");
      }
    });
  },

  // .terrashell에 저장된 토큰을 쓴다. 없는 경우 환경설정에 저장된 TERRASHELL_GITHUB_ACCESS_TOKEN을 쓴다
  getGitToken: async () => {
    // 파일 세팅여부 체크
    const isFileExist = await fs.existsSync(".terrashell");
    if (isFileExist !== true) {
      return;
    }

    let token_buffer = await fs.readFileSync(".terrashell");
    let token = token_buffer.toString();
    if (token) {
      return token;
    } else {
      if (process.env.TERRASHELL_GITHUB_ACCESS_TOKEN) {
        return process.env.TERRASHELL_GITHUB_ACCESS_TOKEN;
      } else {
        return;
      }
    }
  },

  /**
   * github로 부터 해당 repogitory의 설정된 container variables를 조회
   * @param {*} format ecs | json | string
   * @returns
   */
  getGitValues: async (format = "") => {
    const token = await utils.getGitToken();

    if (!token) {
      return;
    }

    const res = await fetch(`https://api.github.com/repos/myroteam1/${env.RUNTIME_APP_NAME}/environments/${env.RUNTIME_ENVIRONMENT}/variables/${env.RUNTIME_APP_ENV_VARS}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${token}`,
      },
    });

    const gitEnvironmentVariables = await res.json();
    const containerEnvironmentVaribles = gitEnvironmentVariables.value; //
    const result = [];

    if (gitEnvironmentVariables && containerEnvironmentVaribles) {
      // Get pairs by splitting on newlines
      containerEnvironmentVaribles.split("\n").forEach(function (line) {
        // Trim whitespace
        const trimmedLine = line.trim();
        // Skip if empty
        if (trimmedLine.length === 0) {
          return;
        }
        // Split on =
        const separatorIdx = trimmedLine.indexOf("=");
        // If there's nowhere to split
        if (separatorIdx === -1) {
          throw new Error(`Cannot parse the environment variable '${trimmedLine}'. Environment variable pairs must be of the form NAME=value.`);
        }
        // Build object
        const variable = {
          name: trimmedLine.substring(0, separatorIdx),
          value: trimmedLine.substring(separatorIdx + 1),
        };

        // Search container definition environment for one matching name
        const variableDef = result.find((e) => e.name == variable.name);
        if (variableDef) {
          // If found, update
          variableDef.value = variable.value;
        } else {
          // Else, create
          result.push(variable);
        }
      });
    }

    if (format == "json") {
      if (env.RUNTIME_REQUEST_DEBUG) {
        console.log(`github env variables:`, result);
      }
      return result;
    } else if (format == "string") {
      if (env.RUNTIME_REQUEST_DEBUG) {
        console.log(`github env variables:`, containerEnvironmentVaribles);
      }
      return containerEnvironmentVaribles;
    } else {
      //ecs env
      const results = {};
      result.forEach((obj) => {
        results[obj.name] = obj.value;
      });
      if (env.RUNTIME_REQUEST_DEBUG) {
        console.log(`github env variables:`, results);
      }
      return JSON.stringify(results);
    }
  },
  // 실행 시간 측정
  getExecutionTime: () => {
    const now = new Date();
    return {
      now: now.toISOString(),
      delay: () => {
        return now.getTime() - env.RUNTIME_NOW.getTime();
      },
    };
  },

  execute: (commands, noti, opt) => {
    const opts = { env: { ...process.env, TF_VAR_APP_VERSION: env.RUNTIME_APP_VERSION }, ...opt };
    const st = spawn("terraform", commands, opts);
    st.stdout.on("data", (data) => {
      process.stdout.write(data);
    });
    st.stderr.on("data", (data) => {
      console.error(`${data}`);
    });
    st.on("close", (code) => {
      // console.info(`child process exited with code ${code}`);
      // const executionTime = getExecutionTime()
      // // 실행후 시간이 입력되면 기존 실행시간과의 차를 출력
      // // const delay = "+" + (executionTime.delay - env.RUNTIME_NOW) + "ms"
      // console.info(`${executionTime.now} Done +${executionTime.delay()}ms`);
      if (noti == true) {
        notification.end();
      }
    });
  },

  executePrompt: (commands, noti) => {
    utils.execute(commands, noti, {
      stdio: [
        "inherit", // stdin: changed from the default `pipe`
        "pipe", // stdout
        "pipe", // stderr: changed from the default `pipe`
      ],
    });
  },
};

// notification
const notification = {
  send: async (subject, message) => {
    execFile("aws", ["sns", "publish", "--subject", subject, "--message", JSON.stringify(message), "--topic-arn", env.TF_NOTIFICATION_SNS_ARN]);
  },
  getSubject: () => {
    return `'${env.RUNTIME_HOSTNAME}'가 ${env.RUNTIME_APP_NAME}(${env.RUNTIME_APP_VERSION})의 '${env.RUNTIME_ENVIRONMENT}'에서 '${env.RUNTIME_REQUEST_FUNCTION}'실행`;
  },
  getMessage: (subject) => {
    return {
      reporter: `${env.RUNTIME_HOSTNAME}`,
      detail: `${env.TF_APP_SHELLNAME}(v${env.TF_APP_VERSION}) runs ${env.RUNTIME_REQUEST_FUNCTION}`,
      eventedAt: `${env.RUNTIME_NOW}`,
      target: `${env.RUNTIME_APP_NAME}(${env.RUNTIME_APP_VERSION})`,
      subject: `${subject}`,
      environment: `${env.RUNTIME_ENVIRONMENT}`,
    };
  },
  start: () => {
    const subject = notification.getSubject() + " 시작함";
    const message = notification.getMessage(subject);
    notification.send(subject, message);
  },
  end: () => {
    const subject = notification.getSubject() + " 종료함";
    const message = notification.getMessage(subject);
    notification.send(subject, message);
  },
};

const workspace = {
  getWorkspace: () => {
    return execFileSync("terraform", ["workspace", "show"]).toString().split("\n")[0];
  },

  current: () => utils.execute(["workspace", "show"]),

  change: (changeWorkspace) => {
    // CURRENT_ENVIRONMENT="$(terraform environment show)"
    // terraform workspace select -or-create $TF_ENVIRONMENT
    if (!changeWorkspace) {
      console.error("workspace is required");
      return;
    }
    utils.execute(["workspace", "select", "-or-create", changeWorkspace]);
    execFile("terraform", ["workspace", "select", "-or-create", changeWorkspace], (err, stdout, stderr) => {
      const exe = utils.getExecutionTime();

      if (err) {
        console.error(err.message);
        return;
      }
      env.RUNTIME_ENVIRONMENT = changeWorkspace;
      console.log(`workspace is changed to:`, env.RUNTIME_ENVIRONMENT);
    });
  },
};

const serverless = {
  // infra/locals.tf에 설정된 repo정보와  package.json로 부터 읽어온 TF_STATE_KEY를 비교해서 잘못된 환경에 다른 application이 배포되지 않도록 체크
  package: () => {
    const isValidated = deploy.validate();
    if (!isValidated) {
      return;
    }

    // 현재 처리중인 앱 이름
    const localApplicationName = env.RUNTIME_APP_NAME;

    // locals로 부터 namespace 추출
    const locals = fs.readFileSync("locals.tf", "utf8");
    const localsLines = locals.split("\n");
    const localsLine = localsLines.find((line) => line.includes("namespace"));
    const localsLineSplit = localsLine.split("=");
    const localsApplicationName = localsLineSplit[1].replace(/"/g, "").trim();

    if (localsApplicationName == localApplicationName) {
      return true;
    } else {
      console.error("project namespace is not matched");
      return;
    }
  },

  // @TODO application build는 추가 구현이 필요함
  build: () => {
    // cd "../app"
    // make build

    // if [ "$IS_BUILD_WITH_LINK" == "true" ]; then
    //   # app에서 make를 맞쳤으므로 root로 이동
    //   cd "../"
    //   build_link
    // fi

    // rm -f ./dist
    // ln -s ../app/dist/ ./dist
    console.info("This feature has not been implemented.");
  },
};

const deploy = {
  info: () => {
    console.log(`current workspace:`, workspace.current());
    console.log(env);
  },

  validate: () => {
    // fmt
    spawnSync("terraform", ["fmt", "-recursive"]);

    // vadliate
    const result = spawnSync("terraform", ["validate", "-json"]);
    const validateResult = JSON.parse(result.stdout);
    if (validateResult.valid == true) {
      return true;
    } else {
      // valid가 아닐때  debug라면 validate 메시지를 출력함
      if (env.RUNTIME_REQUEST_DEBUG) {
        utils.execute(["validate"]);
        return false;
      } else {
        console.error(`validation is failed`);
        return false;
      }
    }
  },

  init: () => {
    const params = [
      "init",
      `-backend-config=bucket=${env.TF_STATE_BUCKET}`,
      `-backend-config=key=${env.TF_STATE_KEY}`,
      `-backend-config=region=${env.TF_STATE_REGION}`,
      `-backend-config=encrypt=${env.TF_STATE_ENCRYPT}`,
      `-backend-config=dynamodb_table=${env.TF_STATE_DYNAMODB}`,
    ];

    if (env.RUNTIME_REQUEST_INIT_WITH_MIGRATE) {
      params.push("-migrate-state");
    }

    if (env.RUNTIME_REQUEST_INIT_WITH_RECONFIGURE) {
      params.push("-reconfigure");
    }

    if (env.RUNTIME_REQUEST_INIT_WITH_UPGRADE) {
      params.push("-upgrade");
    }

    utils.execute(params);
  },

  plan: async () => {
    console.log(`current workspace:`, workspace.current());

    const isValidated = deploy.validate();
    if (!isValidated) {
      return;
    }

    const params = ["plan", `-out=terraform.${env.RUNTIME_ENVIRONMENT}.plan`];

    // @FIXME container에 env를 추가. terraform deploy 시 TD가 revision으로 재정의 됨
    const environment_variables = await utils.getGitValues();
    if (environment_variables) {
      params.push(`-var=environment_variables=${environment_variables}`);
    }

    if (env.RUNTIME_REQUEST_PLAN_WITH_DESTROY) {
      params.push("-destroy");
    }

    utils.execute(params);
  },
  apply: () => {
    console.log(`current workspace:`, workspace.current());

    const isValidated = deploy.validate();
    if (!isValidated) {
      return;
    }

    // apply 이전에 plan을 무조건 실행해야함. 이로인해 terraform.plan를 생성함
    // apply는 terraform.plan를 활용해 처리함
    if (fs.existsSync(`terraform.${env.RUNTIME_ENVIRONMENT}.plan`)) {
      utils.execute(["apply", `terraform.${env.RUNTIME_ENVIRONMENT}.plan`], true);
    } else {
      return;
    }
  },
  destroy: () => {
    console.log(`current workspace:`, workspace.current());

    const isValidated = deploy.validate();
    if (!isValidated) {
      return;
    }

    utils.executePrompt(["apply", "-destroy"]);
  },

  test: () => {
    const isValidated = deploy.validate();
    if (!isValidated) {
      return;
    }

    utils.execute(["test"]);
  },

  run: (requestFunc) => {
    console.log(`current workspace:`, workspace.current());

    const isValidated = deploy.validate();
    if (!isValidated) {
      return;
    }

    utils.execute([requestFunc]);
  },
};

// ======================================================= EXECUTE
program
  .name(env.TF_APP_SHELLNAME)
  .version(env.TF_APP_VERSION)
  .description(`terraform cli v${env.TF_APP_VERSION}`)
  .usage("<function> [options]")
  .argument("<func>", "실행할 함수") // required
  .argument("[command]", "optional 실행할 명령") // optional
  .option("-ne, --no_environment", "environment 설정 없이 진행시")
  .option("-d, --debug", "validate with detail message")
  .option("-l, --with_link", "run with build_link for serverless")
  .option("-b, --with_build", "run with build for serverless")
  .option("-m, --init_with_migrate", "init with migrate")
  .option("-rc, --init_with_reconfigure", "init with reconfigure")
  .option("-u, --init_with_upgrade", "init with upgrade")
  .option("-ds, --plan_with_destroy", "plan with destroy")
  .action(async (func, command, options) => {
    env.RUNTIME_ENVIRONMENT = workspace.getWorkspace();

    env.RUNTIME_REQUEST_FUNCTION = func;
    env.RUNTIME_REQUEST_NO_ENVIRONMENT = options.no_environment ? false : true;
    env.RUNTIME_REQUEST_DEBUG = options.debug ? true : false;
    env.RUNTIME_REQUEST_WITH_LINK = options.with_link ? true : false;
    env.RUNTIME_REQUEST_WITH_BUILD = options.with_build ? true : false;
    env.RUNTIME_REQUEST_INIT_WITH_MIGRATE = options.init_with_migrate ? true : false;
    env.RUNTIME_REQUEST_INIT_WITH_RECONFIGURE = options.init_with_reconfigure ? true : false;
    env.RUNTIME_REQUEST_INIT_WITH_UPGRADE = options.init_with_upgrade ? true : false;
    env.RUNTIME_REQUEST_PLAN_WITH_DESTROY = options.plan_with_destroy ? true : false;

    try {
      // 실행하는 infra repo 의 package.json
      const repogitoryPackageJson = require(path.join(process.cwd(), "../package.json"));
      env.RUNTIME_APP_NAME = repogitoryPackageJson.name; // 현재 처리중인 application 명
      env.RUNTIME_APP_VERSION = repogitoryPackageJson.version; // 현재 처리중인 version 명
      env.TF_STATE_KEY = `${repogitoryPackageJson.name}/${env.TF_STATE_KEY}`; // 현재 처리중인 version 명
    } catch (err) {
      console.error("repogitory package.json을 확인하세요\n");
      program.help();
      if (env.RUNTIME_REQUEST_DEBUG) {
        throw err;
      }
      return;
    }

    switch (env.RUNTIME_REQUEST_FUNCTION) {
      case "notification":
        notification.start();
        break;
      case "current":
        workspace.current();
        break;
      case "change":
        workspace.change(command);
        break;
      case "package":
        serverless.package();
        break;
      case "info":
        deploy.info();
        break;
      case "init":
        deploy.init();
        break;
      case "validate":
        deploy.validate();
        break;
      case "plan":
        deploy.plan();
        break;
      case "apply":
        deploy.apply();
        break;
      case "destroy":
        deploy.destroy();
        break;
      case "test":
        deploy.test();
        break;
      case "run":
        deploy.run(command);
        break;
      case "github":
        const r = await utils.getGitValues();
        console.log(r);
        break;
      case "setToken":
        await utils.setGitToken(command);
        break;
      case "getToken":
        await utils.getGitToken();
        break;

      default:
        program.help();
        break;
    }
  })
  .parse(process.argv);
