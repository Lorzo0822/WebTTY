export default function uname({ args }) {
  const info = {
    s: "WebTTY",                                  // Kernel name (-s)
    n: window.Environment.HOSTNAME || "localhost",   // Network node hostname (-n)
    r: "1.0.0-web",                               // Kernel release (-r)
    v: `#1 SMP ${new Date().toDateString()}`,     // Kernel version (-v)
    m: window.Environment.arch,            // Machine hardware (-m)
    o: "Browser/JS"                               // Operating system (-o)
  };

  if (!args || args.length === 0) {
    return info.s;
  }
  if (args.includes("-a") || args.includes("--all")) {
    return `${info.s} ${info.n} ${info.r} ${info.v} ${info.m} ${info.o}`;
  }
  const output = [];

  for (const arg of args) {
    if (arg.startsWith("-") && !arg.startsWith("--")) {
      const flags = arg.slice(1).split("");
      for (const flag of flags) {
        if (info[flag]) {
          output.push(info[flag]);
        } else {
          return `uname: invalid option -- '${flag}'`;
        }
      }
    } else {
      return `uname: extra operand '${arg}'`;
    }
  }

  return output.join(" ");
}
