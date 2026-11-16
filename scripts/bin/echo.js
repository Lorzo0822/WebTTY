const VARIABLE_PATTERN = /\$([A-Za-z_][A-Za-z0-9_]*)/g;

export default function echo({ args }) {
    return args.join(" ").replace(VARIABLE_PATTERN, (_, name) => window.Environment[name] ?? "");
}
