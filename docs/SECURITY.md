# Security exceptions

## React Router RSC advisory

`GHSA-qwww-vcr4-c8h2` was published on 24 July 2026 and affects unstable React
Server Components request handling in React Router 7.12 through 8.2.

Reigns Atelier uses React Router only in declarative browser mode. It does not
enable React Server Components, server actions, React Router framework mode, or
any of the affected unstable RSC APIs. The advisory is therefore not reachable
in this application.

React Router 8.3 is the patched upstream version, but it also requires the
application to move to the React 19 and Node 22.22 baselines and was not
available from the configured npm registry during this deployment preparation.
The production audit script allows only this exact advisory and continues to
fail for every other reported production vulnerability.

Remove the exception and upgrade to React Router 8.3 or newer after completing
the React 19 compatibility upgrade.
