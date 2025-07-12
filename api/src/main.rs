use std::{net::Ipv4Addr, time::Duration};

use chrono::{DateTime, FixedOffset};
use futures_util::{SinkExt, StreamExt};
use proptest::prelude::*;
use serde::{Deserialize, Serialize};
use test_strategy::Arbitrary;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::Message};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum HttpMethod {
    GET,
    POST,
    PUT,
    DELETE,
    HEAD,
    OPTIONS,
}

impl Arbitrary for HttpMethod {
    type Parameters = ();
    type Strategy = proptest::strategy::BoxedStrategy<Self>;

    fn arbitrary_with(_args: Self::Parameters) -> Self::Strategy {
        use proptest::prelude::*;
        prop_oneof![
            Just(HttpMethod::GET),
            Just(HttpMethod::POST),
            Just(HttpMethod::PUT),
            Just(HttpMethod::DELETE),
            Just(HttpMethod::HEAD),
            Just(HttpMethod::OPTIONS),
        ]
        .boxed()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Arbitrary)]
pub enum HttpVersion {
    Http10,
    Http11,
    Http20,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Arbitrary)]
pub struct HttpRequest {
    pub method: HttpMethod,
    #[strategy(proptest::string::string_regex(r"/[a-zA-Z0-9/_.-]*").unwrap())]
    pub path: String,
    pub version: HttpVersion,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Arbitrary)]
pub struct UpstreamAddr {
    pub ip: Ipv4Addr,
    pub port: u16,
}

fn arbitrary_ipv4() -> impl proptest::strategy::Strategy<Value = Ipv4Addr> {
    use proptest::prelude::*;
    any::<[u8; 4]>().prop_map(Ipv4Addr::from)
}

fn arbitrary_datetime() -> impl proptest::strategy::Strategy<Value = DateTime<FixedOffset>> {
    use chrono::{TimeZone, Utc};
    use proptest::prelude::*;

    (0i64..2147483647i64, -43200i32..43200i32).prop_map(|(timestamp, offset_seconds)| {
        let offset =
            FixedOffset::east_opt(offset_seconds).unwrap_or(FixedOffset::east_opt(0).unwrap());
        let utc_dt = Utc
            .timestamp_opt(timestamp, 0)
            .single()
            .unwrap_or_else(|| Utc.timestamp_opt(0, 0).unwrap());
        utc_dt.with_timezone(&offset)
    })
}

fn arbitrary_url() -> impl proptest::strategy::Strategy<Value = String> {
    use proptest::prelude::*;
    (
        prop_oneof!["http", "https"],
        proptest::string::string_regex(r"[a-zA-Z0-9.-]+").unwrap(),
        proptest::option::of(proptest::string::string_regex(r"/[a-zA-Z0-9._/-]*").unwrap()),
    )
        .prop_map(|(scheme, domain, path)| {
            format!("{}://{}{}", scheme, domain, path.unwrap_or_default())
        })
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Arbitrary)]
pub struct Update {
    #[strategy(arbitrary_ipv4())]
    pub remote_addr: Ipv4Addr,

    #[strategy(proptest::option::of(proptest::string::string_regex(r"[a-zA-Z0-9_-]{1,20}").unwrap()))]
    pub remote_user: Option<String>,

    #[strategy(arbitrary_datetime())]
    pub time_local: DateTime<FixedOffset>,

    pub request: HttpRequest,

    #[strategy(100u16..600u16)]
    pub status: u16,

    #[strategy(0u64..1000000u64)]
    pub body_bytes_sent: u64,

    #[strategy(proptest::option::of(arbitrary_url()))]
    pub http_referer: Option<String>,

    #[strategy(proptest::string::string_regex(r"[a-zA-Z0-9 /.()_-]{10,100}").unwrap())]
    pub http_user_agent: String,

    #[strategy(proptest::option::of(arbitrary_ipv4()))]
    pub http_x_forwarded_for: Option<Ipv4Addr>,

    #[strategy(0.001f64..30.0f64)]
    pub request_time: f64,

    #[strategy(proptest::option::of(0.001f64..30.0f64))]
    pub upstream_response_time: Option<f64>,

    #[strategy(proptest::option::of(any::<UpstreamAddr>()))]
    pub upstream_addr: Option<UpstreamAddr>,

    #[strategy(1u64..10000u64)]
    pub request_length: u64,

    #[strategy(1u64..1000000u64)]
    pub connection: u64,

    #[strategy(1u64..1000u64)]
    pub connection_requests: u64,

    #[strategy(-90.0f64..90.0f64)]
    pub lat: f64,

    #[strategy(-180.0f64..180.0f64)]
    pub lng: f64,
}

async fn handle_websocket(stream: TcpStream, addr: std::net::SocketAddr) {
    println!("WebSocket connection from: {}", addr);

    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("Failed to accept WebSocket connection: {}", e);
            return;
        }
    };

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let mut runner = proptest::test_runner::TestRunner::default();

    // Handle incoming messages (if any) in a separate task
    let _receiver_task = tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Close(_)) => break,
                Ok(_) => {} // Ignore other message types for now
                Err(e) => {
                    eprintln!("WebSocket receive error: {}", e);
                    break;
                }
            }
        }
    });

    // Send updates continuously
    loop {
        let update = any::<Update>().new_tree(&mut runner).unwrap().current();
        let json = serde_json::to_string(&update).unwrap();

        if let Err(e) = ws_sender.send(Message::Text(json)).await {
            eprintln!("Failed to send to {}: {}", addr, e);
            break;
        }

        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("0.0.0.0:3000").await?;
    println!("WebSocket server listening on port 3000");

    while let Ok((stream, addr)) = listener.accept().await {
        tokio::spawn(handle_websocket(stream, addr));
    }

    Ok(())
}
