use actix_cors::Cors;
use actix_web::{get, App, HttpResponse, HttpServer, Responder};
use rand::seq::SliceRandom;
use rand::thread_rng;

const LAND_COORDS: &[(f64, f64)] = &[
    (34.05, -118.24),  // LA
    (48.85, 2.35),     // Paris
    (-33.87, 151.21),  // Sydney
    (40.71, -74.00),   // NYC
    (35.68, 139.69),   // Tokyo
    (-23.55, -46.63),  // São Paulo
    (55.75, 37.61),    // Moscow
    (19.43, -99.13),   // Mexico City
    (28.61, 77.20),    // Delhi
    (-1.29, 36.82),    // Nairobi
    (31.23, 121.47),   // Shanghai
    (52.52, 13.40),    // Berlin
    (51.50, -0.12),    // London
    (37.77, -122.42),  // SF
];

#[get("/land-points")]
async fn land_points() -> impl Responder {
    let mut rng = thread_rng();
    let sample: Vec<_> = LAND_COORDS
        .choose_multiple(&mut rng, 5)
        .cloned()
        .collect();
    HttpResponse::Ok().json(sample)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        let cors = Cors::permissive();
        App::new().wrap(cors).service(land_points)
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
