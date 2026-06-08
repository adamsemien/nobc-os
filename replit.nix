# Replit Nix toolchain for NoBC OS.
# Node 20 (project targets Next.js 15 / Node 20+) + openssl, which Prisma's
# query engine links against at runtime. npm ships with nodejs_20.
{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.openssl
  ];
}
