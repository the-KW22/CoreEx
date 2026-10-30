# Build stage: Maven wrapper, tests are skipped here because CI already ran them.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q package -DskipTests

# Run stage: JRE only, not root.
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --no-create-home coreex
COPY --from=build /app/target/backend-*.jar app.jar
USER coreex
# Fit small instances (512 MB, a fraction of a CPU): the JVM may use 75% of the container's memory, and it starts with
# the simple compiler (C1 only) and the serial garbage collector, which cut start-up time and CPU on a tiny instance.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:TieredStopAtLevel=1", "-XX:+UseSerialGC", "-jar", "app.jar"]
