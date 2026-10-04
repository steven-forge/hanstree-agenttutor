"""관리자가 등록한 공개 피드·본문만 읽는 무인증 HTTPS 요청. 프록시와 쿠키는 사용하지 않는다."""

import http.client
import ipaddress
import socket
import ssl
import time
import urllib.parse

from news_policy import validate_public_url

TIMEOUT = 20
MAX_BYTES = 3 * 1024 * 1024
MAX_REDIRECTS = 3
TRANSLATION_RANGES = (ipaddress.ip_network("64:ff9b::/96"), ipaddress.ip_network("64:ff9b:1::/48"))


def public_addresses(host: str) -> list[tuple]:
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP)
    if not addresses:
        raise ValueError("채널 호스트의 공인 IP를 찾지 못했습니다.")
    result = []
    for family, socktype, proto, _, sockaddr in addresses:
        address = ipaddress.ip_address(sockaddr[0])
        if family not in (socket.AF_INET, socket.AF_INET6) or not address.is_global or address.is_multicast or address.is_reserved or getattr(address, "is_site_local", False) or getattr(address, "ipv4_mapped", None) or getattr(address, "sixtofour", None) or getattr(address, "teredo", None) or any(address in network for network in TRANSLATION_RANGES):
            raise ValueError("채널 호스트가 내부 또는 특수 IP 주소를 포함합니다.")
        entry = (family, socktype, proto, sockaddr)
        if entry not in result:
            result.append(entry)
    return result


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    """이미 검증한 IP에만 연결하며 인증서는 원래 DNS 호스트 이름으로 검증한다."""

    def __init__(self, host: str, address: tuple, timeout: float):
        super().__init__(host, port=443, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        family, socktype, proto, sockaddr = self.address
        raw = socket.socket(family, socktype, proto)
        try:
            raw.settimeout(self.timeout)
            raw.connect(sockaddr)  # hostname을 다시 해석하지 않는다.
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


def fetch_public_url(url: str, allowed_hosts: set | frozenset, max_bytes: int = MAX_BYTES) -> tuple[int, dict, bytes]:
    """모든 DNS 응답을 검사한 뒤 IP 고정 연결. 리다이렉트도 같은 등록 호스트와 검사를 거친다."""
    if not allowed_hosts:
        raise ValueError("채널 요청에는 등록된 호스트가 필요합니다.")
    allowed = {host.lower() for host in allowed_hosts}
    deadline = time.monotonic() + TIMEOUT
    for hop in range(MAX_REDIRECTS + 1):
        host = validate_public_url(url)
        if host not in allowed:
            raise ValueError("등록되지 않은 채널 호스트로의 접근을 거부했습니다.")
        addresses = public_addresses(host)
        parts = urllib.parse.urlsplit(url)
        path = parts.path or "/"
        if parts.query:
            path += "?" + parts.query
        last_error = None
        for address in addresses:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("채널 요청 제한 시간을 초과했습니다.")
            connection = PinnedHTTPSConnection(host, address, remaining)
            try:
                connection.request("GET", path, headers={
                    "User-Agent": "AgentTutor-Public-Feed/1.0",
                    "Accept": "application/rss+xml,application/atom+xml,application/xml,text/xml,text/html;q=0.9",
                    "Accept-Encoding": "identity",
                })
                response = connection.getresponse()
                status = response.status
                headers = {key.lower(): value for key, value in response.getheaders()}
                if status in (301, 302, 303, 307, 308):
                    if hop >= MAX_REDIRECTS or not headers.get("location"):
                        raise ValueError("채널 리다이렉트 횟수를 초과했거나 목적지가 없습니다.")
                    location = headers["location"]
                    if any(ord(char) < 33 or ord(char) > 126 for char in location) or "\\" in location or "#" in location:
                        raise ValueError("채널 리다이렉트 주소 형식이 올바르지 않습니다.")
                    url = urllib.parse.urljoin(url, location)
                    break  # 다음 요청 전 호스트·DNS·IP를 모두 재검사한다.
                if headers.get("content-encoding", "identity").lower() != "identity":
                    raise ValueError("압축된 채널 응답은 지원하지 않습니다.")
                chunks, size = [], 0
                while size <= max_bytes:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError("채널 요청 제한 시간을 초과했습니다.")
                    if connection.sock is not None:
                        connection.sock.settimeout(remaining)
                    chunk = response.read1(min(65536, max_bytes + 1 - size))
                    if not chunk:
                        return status, headers, b"".join(chunks)
                    chunks.append(chunk)
                    size += len(chunk)
                raise ValueError("채널 응답이 최대 허용 크기를 초과했습니다.")
            except (OSError, http.client.HTTPException) as error:
                last_error = error
            finally:
                connection.close()
        else:
            raise RuntimeError("채널 HTTPS 연결에 실패했습니다.") from last_error
    raise ValueError("채널 리다이렉트 횟수를 초과했습니다.")
