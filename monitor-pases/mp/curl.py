"""Transporte alternativo con curl (viene con Windows 10/11 en System32).

Sirve cuando el proxy de la VDI pide autenticación de Windows (NTLM/Kerberos),
que urllib no sabe hacer: `--proxy-user :` hace que curl use tu sesión de
Windows. En Windows curl usa además el almacén de certificados del sistema.
"""

import os
import shutil
import subprocess
import tempfile


def _exe():
    for nombre in ("curl.exe", "curl"):
        r = shutil.which(nombre)
        if r:
            return r
    return None


def peticion_curl(metodo, url, cabeceras, datos, seguir, proxy, ca, timeout):
    from .ghe import ErrorGHE

    exe = _exe()
    if not exe:
        raise ErrorGHE("No se encuentra curl en este equipo.", pista="Vuelve al transporte «python» en Ajustes → Conexión.")
    tmp = tempfile.mkdtemp(prefix="mp-")
    f_cab, f_cuerpo, f_datos = (os.path.join(tmp, n) for n in ("cab", "cuerpo", "datos"))
    args = [exe, "-sS", "-X", metodo, "--max-time", str(timeout), "-D", f_cab, "-o", f_cuerpo]
    if seguir:
        args.append("-L")  # curl no reenvía la cabecera Authorization a otro host
    if proxy:
        args += ["--proxy", proxy, "--proxy-anyauth", "--proxy-user", ":"]
    if ca:
        args += ["--cacert", ca]
    if os.name == "nt":
        args.append("--ssl-no-revoke")  # la revocación suele fallar detrás de proxies corporativos
    for k, v in cabeceras.items():
        args += ["-H", "%s: %s" % (k, v)]
    if datos is not None:
        with open(f_datos, "wb") as f:
            f.write(datos)
        args += ["--data-binary", "@" + f_datos]
    try:
        r = subprocess.run(args, capture_output=True, timeout=timeout + 10,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if r.returncode != 0:
            msg = r.stderr.decode("utf-8", "replace").strip()
            raise ErrorGHE("curl no pudo conectar: " + msg, url=url,
                           pista="Revisa el proxy y el certificado en Ajustes → Conexión.")
        with open(f_cab, "rb") as f:
            bloques = [b for b in f.read().decode("latin-1").replace("\r\n", "\n").split("\n\n") if b.strip()]
        ultimo = bloques[-1].split("\n") if bloques else ["HTTP/1.1 000"]
        try:
            estado = int(ultimo[0].split()[1])
        except (IndexError, ValueError):
            estado = 0
        cab = {}
        for linea in ultimo[1:]:
            if ":" in linea:
                k, v = linea.split(":", 1)
                cab[k.strip().lower()] = v.strip()
        with open(f_cuerpo, "rb") as f:
            cuerpo = f.read()
        return estado, cab, cuerpo
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
