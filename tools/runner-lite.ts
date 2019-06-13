#!/usr/bin/env node
// lightweight version of runner.ts that is designed for on-prem pkg/slim builds,
// which package `db` as a standalone executable with obfuscated source code
//
// - designed not to use the yargs commandDir discovery
// - only includes the commands/geoip and commands/up/pg
// - included as bin/retraceddb in the pkg/slim builds instead of
//   the more heavyweight runner.ts
//

import "source-map-support/register";
import * as yargs from "yargs";
import * as geoIP from "./commands/geoip";
import * as reindex from "./commands/reindex/postgres";
import * as reindexRange from "./commands/reindex/range";

yargs
  .command(geoIP.command, geoIP.describe, geoIP.builder, geoIP.handler)
  .command("reindex", reindex.desc, reindex.builder, reindex.handler)
  .command("reindex-range", reindexRange.desc, reindexRange.builder, reindexRange.handler)
  .env()
  .help()
  .argv;
