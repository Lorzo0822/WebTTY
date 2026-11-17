import { readFile } from "../filesystem.js";

export default async function webfetch({ args, cwd, resolvePath }) {
    const osRelease = await readFile(resolvePath("/etc/os-release"));
    
    const result = Object.fromEntries(
        osRelease
            .trim()
            .split('\n')
            .filter(line => line.includes('='))
            .map(line => {
            const index = line.indexOf('=');
            const key = line.slice(0, index).trim();
            let val = line.slice(index + 1).trim();

            val = val.replace(/^["']|["']$/g, '');

            return [key, val];
        })
    );

    const canvas = document.getElementById("display");
    const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
    const debugInfo = gl?.getExtension("WEBGL_debug_renderer_info");

    const webglRenderer = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : gl?.getParameter(gl.RENDERER) || "Unavailable";
        
    const webglVersion = gl ? gl.getParameter(gl.VERSION) : "Unavailable";
    
    const gpuVendor = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : gl?.getParameter(gl.VENDOR) || "Unavailable";

    const tux = `
        $#7F7F7F#####$#	       @${window.Environment.HOSTNAME}
       $#7F7F7F#######$#	       OS: ${result["PRETTY_NAME"]}
       $#7F7F7F##$#$#FFFFFFO$#$#7F7F7F#$#$#FFFFFFO$#$#7F7F7F##$#	       arch: ${window.Environment.arch}
       $#7F7F7F#$#$#FFFF00#####$#$#7F7F7F#$#
     $#7F7F7F##$#$#FFFFFF##$#$#FFFF00###$#$#FFFFFF##$#$#7F7F7F##$#       WebGL: ${webglRenderer}
    $#7F7F7F#$#$#FFFFFF##########$#$#7F7F7F##$#      WebGL version: ${webglVersion}
   $#7F7F7F#$#$#FFFFFF############$#$#7F7F7F##$#     GPU vendor: ${gpuVendor}
   $#7F7F7F#$#$#FFFFFF############$#$#7F7F7F###$#
  $#FFFF00##$#$#7F7F7F#$#$#FFFFFF############$#$#7F7F7F##$#$#FFFF00#$#    online: ${navigator.onLine}
$#FFFF00######$#$#7F7F7F#$#$#FFFFFF#######$#$#7F7F7F#$#$#FFFF00######$#
$#FFFF00#######$#$#7F7F7F#$#$#FFFFFF#####$#$#7F7F7F#$#$#FFFF00#######$#  home: ${window.Environment.HOME}
  $#FFFF00#####$#$#7F7F7F#######$#$#FFFF00#####$#
`;
    return tux;
}