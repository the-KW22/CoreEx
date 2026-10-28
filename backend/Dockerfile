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
# Fit small instances (512 MB): the JVM may use 75% of the container's memory.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
