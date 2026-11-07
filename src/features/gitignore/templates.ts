export interface IgnoreTemplate {
  id: string;
  name: string;
  lines: string[];
}

export const IGNORE_TEMPLATES: IgnoreTemplate[] = [
  {
    id: "node",
    name: "Node.js",
    lines: [
      "node_modules/",
      "npm-debug.log*",
      "yarn-debug.log*",
      "yarn-error.log*",
      "pnpm-debug.log*",
      ".pnpm-store/",
      "dist/",
      "build/",
      "coverage/",
      ".env",
      ".env.local",
      ".env.*.local",
      "*.tsbuildinfo",
      ".next/",
      ".nuxt/",
      ".cache/",
      ".parcel-cache/",
      ".eslintcache",
      "*.tgz",
    ],
  },
  {
    id: "python",
    name: "Python",
    lines: [
      "__pycache__/",
      "*.py[cod]",
      "*$py.class",
      "*.so",
      ".Python",
      "build/",
      "dist/",
      "*.egg-info/",
      ".eggs/",
      ".venv/",
      "venv/",
      "env/",
      ".env",
      ".pytest_cache/",
      ".mypy_cache/",
      ".ruff_cache/",
      ".tox/",
      ".coverage",
      "htmlcov/",
      ".ipynb_checkpoints/",
    ],
  },
  {
    id: "rust",
    name: "Rust",
    lines: ["target/", "**/*.rs.bk", "*.pdb"],
  },
  {
    id: "go",
    name: "Go",
    lines: ["*.exe", "*.exe~", "*.dll", "*.so", "*.dylib", "*.test", "*.out", "vendor/", "go.work", "bin/", "coverage.out"],
  },
  {
    id: "java",
    name: "Java",
    lines: ["*.class", "*.log", "*.jar", "*.war", "*.ear", "hs_err_pid*", "target/", "build/", ".gradle/", "out/", ".classpath", ".project", ".settings/"],
  },
  {
    id: "dotnet",
    name: ".NET y Visual Studio",
    lines: ["[Bb]in/", "[Oo]bj/", ".vs/", "*.user", "*.suo", "*.userprefs", "*.pdb", "*.cache", "packages/", "TestResults/", "*.nupkg", "publish/"],
  },
  {
    id: "cpp",
    name: "C y C++",
    lines: ["*.o", "*.obj", "*.a", "*.lib", "*.so", "*.dll", "*.dylib", "*.exe", "*.out", "*.pdb", "*.ilk", "*.d", "build/", "cmake-build-*/", "CMakeCache.txt", "CMakeFiles/", ".cache/"],
  },
  {
    id: "php",
    name: "PHP y Composer",
    lines: ["vendor/", "composer.phar", ".phpunit.result.cache", ".env", "*.log", "node_modules/"],
  },
  {
    id: "ruby",
    name: "Ruby",
    lines: ["*.gem", "*.rbc", "/.config", "/coverage/", "/pkg/", "/tmp/", ".bundle/", "/vendor/bundle", ".byebug_history", ".env", "log/*.log"],
  },
  {
    id: "swift",
    name: "Swift y Xcode",
    lines: ["build/", "DerivedData/", "*.xcuserstate", "xcuserdata/", ".swiftpm/", "Pods/", "*.ipa", "*.dSYM.zip", "*.dSYM/"],
  },
  {
    id: "android",
    name: "Android",
    lines: ["*.apk", "*.aab", "*.ap_", "*.dex", "bin/", "gen/", "build/", ".gradle/", "local.properties", "captures/", ".externalNativeBuild/", ".cxx/", "*.iml"],
  },
  {
    id: "unity",
    name: "Unity",
    lines: ["[Ll]ibrary/", "[Tt]emp/", "[Oo]bj/", "[Bb]uild/", "[Bb]uilds/", "[Ll]ogs/", "[Uu]ser[Ss]ettings/", "MemoryCaptures/", "*.csproj", "*.sln", "*.suo", "*.user", "*.pidb", "*.unityproj", ".vs/", "sysinfo.txt", "*.apk", "*.aab", "*.unitypackage"],
  },
  {
    id: "terraform",
    name: "Terraform",
    lines: [".terraform/", "*.tfstate", "*.tfstate.*", "crash.log", "*.tfvars", "override.tf", "override.tf.json", ".terraformrc", "terraform.rc"],
  },
  {
    id: "windows",
    name: "Windows",
    lines: ["Thumbs.db", "ehthumbs.db", "Desktop.ini", "$RECYCLE.BIN/", "*.lnk"],
  },
  {
    id: "macos",
    name: "macOS",
    lines: [".DS_Store", ".AppleDouble", ".LSOverride", "._*", ".Spotlight-V100", ".Trashes"],
  },
  {
    id: "linux",
    name: "Linux",
    lines: ["*~", ".fuse_hidden*", ".directory", ".Trash-*", ".nfs*"],
  },
  {
    id: "jetbrains",
    name: "JetBrains",
    lines: [".idea/", "*.iml", "*.iws", "*.ipr"],
  },
  {
    id: "vscode",
    name: "Visual Studio Code",
    lines: [".vscode/*", "!.vscode/settings.json", "!.vscode/tasks.json", "!.vscode/launch.json", "!.vscode/extensions.json", "*.code-workspace"],
  },
];
