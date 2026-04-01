FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o dealer .

FROM alpine:3.21
RUN apk add --no-cache redis ca-certificates
WORKDIR /app
COPY --from=builder /app/dealer .

# Redis config: AOF persistence
RUN mkdir -p /data && echo -e "appendonly yes\nappendfsync everysec\nmaxmemory 50mb\nmaxmemory-policy noeviction\ndir /data" > /etc/redis.conf

COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

EXPOSE 8080
CMD ["./entrypoint.sh"]
