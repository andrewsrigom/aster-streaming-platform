import "trusted-operations" as trusted;

fn deny(status) {
    throw #{status: status, message: "Request rejected."};
}

fn trusted_mode() {
    let environment = env::get("ASTER_ENV");
    let mode = env::get("ASTER_ROUTER_TRUSTED_OPERATIONS_MODE");
    if !(environment in ["local", "integration", "staging", "production"]) ||
       !(mode in ["audit", "enforce"]) ||
       (mode == "audit" && !(environment in ["local", "integration"])) ||
       (environment in ["staging", "production"] && mode != "enforce") {
        throw "Invalid trusted-operation environment or mode.";
    }
    mode
}

fn guard(request) {
    if request.method != "POST" || request.uri.path != "/graphql" {
        deny(405);
    }
    if request.uri.to_string().contains("?") { deny(400); }
    let seen = #{};
    let count = 0;
    let bytes = 0;
    for pair in request.headers {
        let name = pair.name.to_string();
        let value = pair.value.to_string();
        count += 1;
        bytes += name.len + value.len + 4;
        if count > 64 || bytes > 16384 || name == "None" || seen.contains(name) {
            deny(400);
        }
        seen[name] = true;
        if name == "authorization" || name == "forwarded" || name == "traceparent" ||
           name == "tracestate" || name == "baggage" || name.starts_with("x-forwarded-") ||
           (name.starts_with("x-aster-") && name != "x-aster-csrf") {
            deny(403);
        }
    }
    for required in ["host", "origin", "x-aster-csrf", "content-type"] {
        if !(required in request.headers) { deny(403); }
    }
    let origin = request.headers["origin"].to_string();
    let web = origin == "http://127.0.0.1:3000";
    let diagnostic = origin == "http://127.0.0.1:4000";
    if request.headers["host"] != "127.0.0.1:4000" ||
       !(web || diagnostic) || request.headers["x-aster-csrf"] != "1" ||
       (web && (!("sec-fetch-site" in request.headers) || request.headers["sec-fetch-site"] != "same-site")) ||
       (diagnostic && "sec-fetch-site" in request.headers && request.headers["sec-fetch-site"] != "same-origin") {
        deny(403);
    }
    let content_type = request.headers["content-type"].to_lower();
    if !(content_type in ["application/json", "application/json; charset=utf-8", "application/json;charset=utf-8"]) ||
       ("content-encoding" in request.headers && request.headers["content-encoding"] != "identity") {
        deny(415);
    }
}

fn no_store(response) {
    response.headers["cache-control"] = "no-store";
    response.headers["x-content-type-options"] = "nosniff";
}

fn router_service(service) {
    service.map_request(Fn("guard"));
    service.map_response(Fn("no_store"));
}

fn operation(request) {
    let mode = trusted_mode();
    let name = request.body.operation_name;
    let query = request.body.query;
    let label = if name == () { "other" } else { trusted::operation_label(name) };
    let result = if name == () || query == () || name.len == 0 || query.len == 0 {
        "missing"
    } else {
        trusted::match_operation(name, sha256::digest(query))
    };
    request.context["aster.trusted_operation"] = result;
    request.context["aster.operation"] = if result == "matched" || mode == "audit" { label } else { "other" };
    request.context["aster.started_ms"] = unix_ms_now();
    if mode == "enforce" && result != "matched" {
        request.context["aster.outcome"] = "rejected";
        throw #{
            status: 400,
            body: #{
                errors: [#{
                    message: "GraphQL operation failed.",
                    extensions: #{code: "TRUSTED_OPERATION_REQUIRED"}
                }]
            }
        };
    }
}

fn public_response(response) {
    response.context["aster.duration_ms"] = if response.context["aster.started_ms"] != () { max(0, unix_ms_now() - response.context["aster.started_ms"]) } else { 0 };
    if response.is_primary() && response.context["aster.session_cookie"] != () {
        response.headers["set-cookie"] = response.context["aster.session_cookie"];
    }
    let sanitized = [];
    let rejected = false;
    let failed = false;
    for error in response.body.errors {
        let code = error.extensions?.code;
        let allowed = ["UNAUTHENTICATED", "FORBIDDEN", "INVALID_INPUT", "UNAVAILABLE", "CANCELLED", "LIMIT_EXCEEDED", "TRUSTED_OPERATION_REQUIRED", "GRAPHQL_VALIDATION_FAILED", "GRAPHQL_PARSE_FAILED", "SUBGRAPH_ERROR", "SUBREQUEST_HTTP_ERROR", "GATEWAY_TIMEOUT", "REQUEST_TIMEOUT"];
        if code in ["UNAUTHENTICATED", "FORBIDDEN", "INVALID_INPUT", "LIMIT_EXCEEDED", "TRUSTED_OPERATION_REQUIRED", "GRAPHQL_VALIDATION_FAILED", "GRAPHQL_PARSE_FAILED"] {
            rejected = true;
        } else {
            failed = true;
        }
        error.message = "GraphQL operation failed.";
        error.extensions = #{code: if code in allowed { code } else { "UNAVAILABLE" }};
        sanitized.push(error);
    }
    response.body.errors = sanitized;
    response.context["aster.outcome"] = if failed { "failed" } else if rejected { "rejected" } else { "completed" };
}

fn supergraph_service(service) {
    trusted_mode();
    service.map_request(Fn("operation"));
    service.map_response(Fn("public_response"));
}

fn identity_cookie(response) {
    if "set-cookie" in response.headers {
        let cookies = response.headers.values("set-cookie");
        if cookies.len != 1 || cookies[0].len > 4096 || !cookies[0].starts_with("aster_local_session=") {
            deny(502);
        }
        response.context["aster.session_cookie"] = cookies[0];
    }
}

fn subgraph_service(service, subgraph) {
    if subgraph == "identity" {
        service.map_response(Fn("identity_cookie"));
    }
}
