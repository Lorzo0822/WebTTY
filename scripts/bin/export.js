const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export default function exportVariables({ args }) {
    if (args.length === 0) {
        return Object.keys(window.Environment)
            .sort()
            .map((name) => `${name}=${window.Environment[name]}`)
            .join("\n");
    }

    for (const assignment of args) {
        const separator = assignment.indexOf("=");
        if (separator < 1) throw new Error(`export: expected NAME=value, got: ${assignment}`);

        const name = assignment.slice(0, separator);
        const value = assignment.slice(separator + 1);
        if (!VALID_NAME.test(name)) throw new Error(`export: invalid variable name: ${name}`);
        window.Environment[name] = value;
    }
    return "";
}
