"""Exercise the installer with an isolated config and a fake Docker command."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "install_logics", Path(__file__).with_name("install-logics.py")
)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTest(unittest.TestCase):
    def test_init_retry_and_compose_isolation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            config = root / ".env.logics-install"
            with (
                patch.object(installer, "ROOT", root),
                patch.object(installer, "ENV_FILE", config),
                patch.object(installer.shutil, "which", return_value="docker"),
                patch.object(installer.subprocess, "run") as run,
                contextlib.redirect_stdout(io.StringIO()),
            ):
                installer.initialize()
                original = config.read_text()
                installer.initialize()
                self.assertEqual(config.read_text(), original)
                secrets = dict(line.split("=", 1) for line in original.splitlines())
                self.assertNotEqual(secrets["MYSQL_PASSWORD"], secrets["MYSQL_ROOT_PASSWORD"])
                self.assertEqual(secrets["INK_WEB_BIND"], "127.0.0.1")
                with self.assertRaisesRegex(SystemExit, "GOOGLE_CLIENT_ID"):
                    installer.compose("up")
                run.assert_not_called()

                config.write_text(original.replace(installer.PLACEHOLDER, "example"))
                with patch.dict(os.environ, {"MYSQL_PASSWORD": "elsewhere"}):
                    installer.compose("up")
                cmd, = run.call_args.args
                self.assertEqual(cmd[2:4], ["--project-name", "logics-install"])
                self.assertEqual(cmd[-2:], ["mysql", "web"])
                self.assertIn("--wait", cmd)
                self.assertNotIn("MYSQL_PASSWORD", run.call_args.kwargs["env"])
                installer.compose("status")
                self.assertEqual(run.call_args.args[0][-3:], ["ps", "mysql", "web"])


if __name__ == "__main__":
    unittest.main()
