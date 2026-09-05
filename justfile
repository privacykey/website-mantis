# List available commands
default:
    @just --list

# Rebuild and preview the site locally (Node.js 22+)
[group("dev")]
run:
    node scripts/build.mjs
    node scripts/serve.mjs

# Check generated files, links, themes, and behavior
[group("dev")]
check:
    node scripts/check.mjs
    node --test tests/*.test.mjs

# Publish by hand; pushes to main also deploy through Cloudflare Workers Builds
[group("deploy")]
deploy: check
    npx --yes wrangler@latest deploy
