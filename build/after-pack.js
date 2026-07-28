const path = require("path");
const { execFileSync } = require("child_process");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const editor = path.join(context.packager.projectDir, "build", "tools", "rcedit-x64.exe");
  const icon = path.join(context.packager.projectDir, "build", "icon.ico");
  const executable = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  execFileSync(editor, [executable, "--set-icon", icon], { windowsHide: true });
};
