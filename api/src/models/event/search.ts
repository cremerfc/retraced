
import getEs from "../../persistence/elasticsearch";

const es = getEs();

export interface Options {
  index: string;
  sort: "asc" | "desc";

  newScroll?: boolean;
  scrollLifetime?: string; // time period, e.g. "5m"
  scrollId?: string; // use to get next page of results

  offset?: number;
  length?: number;

  searchText?: string;
  startTime?: number;
  endTime?: number;
  groupId?: string;
  actorIds?: string[];
  actions?: string[];
  crud?: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
  };

  fetchAll?: boolean;
  groupOmitted?: boolean;

  targetIds?: string[];
}

export interface Result {
  totalHits: number;
  count: number;
  events?: any[];
  scrollId?: string;
}

export default async function(opts: Options): Promise<Result> {
  if (!opts.newScroll && opts.scrollId && opts.scrollLifetime) {
    // This isn't a normal query: it's a request for another page of results.
    const scrollParams = {
      scroll_id: opts.scrollId,
      scroll: opts.scrollLifetime,
    };
    const resp = await es.scroll(scrollParams);
    let results: Result = {
      totalHits: resp.hits.total,
      count: resp.hits.hits ? resp.hits.hits.length : 0,
      events: [],
    };
    if (results.count > 0) {
      for (const hit of resp.hits.hits) {
        results.events!.push(hit["_source"]);
      }
      results.scrollId = resp._scroll_id;

    }
    return results;
  }

  // These comprise the bulk of the query.
  const filters: any = [];

  if (opts.searchText) {
    filters.push({
      multi_match: {
        query: opts.searchText,
        fields: [
          "action",
          "group.name",
          "actor.name",
          "target.name",
          "description",
          "country",
          "loc_subdiv1",
          "loc_subdiv2",
          "fields.*",
        ],
      },
    });
  }

  if (opts.targetIds) {
    const clause = {
      bool: {
        should: <any> [],
      },
    };
    for (const targetId of opts.targetIds) {
      clause.bool.should.push({
        term: {
          "target.id": targetId,
        },
      });
      filters.push(clause);
    }
  }

  if (opts.startTime) {
    filters.push({
      range: { canonical_time: { gte: opts.startTime } },
    });
  }
  if (opts.endTime) {
    filters.push({
      range: { canonical_time: { lte: opts.endTime } },
    });
  }

  // Restrict query to specific group.
  // We also check team_id here for backwards compat.
  if (!opts.groupOmitted) {
    filters.push({
      bool: {
        should: [
          { term: { "group.id": opts.groupId } },
          { term: { team_id: opts.groupId } },
        ],
      },
    });
  }

  if (opts.actorIds) {
    const clause = {
      bool: {
        should: <any> [],
      },
    };
    for (const actorId of opts.actorIds) {
      clause.bool.should.push({
        term: {
          "actor.id": actorId,
        },
      });
    }
    filters.push(clause);
  }

  if (opts.actions) {
    const clause = {
      bool: {
        should: <any> [],
      },
    };
    for (const action of opts.actions) {
      clause.bool.should.push({
        term: {
          action,
        },
      });
    }
    filters.push(clause);
  }

  const mustNots: any = [];

  if (!opts.crud || !opts.crud.create) {
    mustNots.push({ term: { crud: "c" } });
  }
  if (!opts.crud || !opts.crud.read) {
    mustNots.push({ term: { crud: "r" } });
  }
  if (!opts.crud || !opts.crud.update) {
    mustNots.push({ term: { crud: "u" } });
  }
  if (!opts.crud || !opts.crud.delete) {
    mustNots.push({ term: { crud: "d" } });
  }

  const query = {
    bool: {
      filter: filters,
      must_not: mustNots,
    },
  };

  const params: any = {
    index: opts.index,
    type: "event",
    _source: true,
    from: opts.offset || 0,
    size: opts.fetchAll ? 5000 : opts.length,
    scroll: opts.newScroll ? opts.scrollLifetime : undefined,
    sort: [`canonical_time:${opts.sort}`],
    body: {
      query,
    },
  };

  if (!opts.fetchAll) {
    // Normal search.
    const resp = await es.search(params);
    let results: Result = {
      totalHits: resp.hits.total,
      count: resp.hits.hits ? resp.hits.hits.length : 0,
      events: [],
    };
    if (results.count > 0) {
      for (const hit of resp.hits.hits) {
        results.events!.push(hit["_source"]);
      }
    }
    if (resp._scroll_id) {
      results.scrollId = resp._scroll_id;
    }
    return results;

  } else {
    // Here we use the scrolling API to pull every single event from the index.
    // TODO: Stream this data to disk for later serving. Could be huge.
    let results: Result = {
      totalHits: 0,
      count: 0,
      events: [],
    };
    params.scroll = "1m";
    let initialResp = await es.search(params);
    if (initialResp.hits.total > 0) {
      const scrollParams = {
        scroll_id: initialResp._scroll_id,
        scroll: "1m",
      };
      results.totalHits = results.count = initialResp.hits.total;
      for (const hit of initialResp.hits.hits) {
        results.events!.push(hit["_source"]);
      }
      while (true) {
        const resp = await es.scroll({
          scroll: scrollParams.scroll,
          body: scrollParams.scroll_id,
        });
        if (resp.hits.hits.length === 0) {
          break;
        }
        for (const hit of resp.hits.hits) {
          results.events!.push(hit["_source"]);
        }
        scrollParams.scroll_id = resp._scroll_id;
      }
    }
    return results;
  }
}
