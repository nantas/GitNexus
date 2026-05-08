# Specification Delta

## Capability 对齐（已确认）

- Capability: `grpc-thrift-contracts`
- 来源: `proposal.md`
- 变更类型: `new`

## 规范真源声明

- 本文件是该 capability 在本次 change 中的行为规范真源
- design / tasks / verification 必须引用本文件

## ADDED Requirements

### Requirement: gRPC Contract Extraction
The system SHALL parse `.proto` files and extract service definitions, RPC methods, and message types as graph nodes.

#### Scenario: Proto service extraction
- **WHEN** a `.proto` file defines `service UserService { rpc GetUser(...) returns (...); }`
- **THEN** a Service node `UserService` with Method `GetUser` SHALL appear in the graph

### Requirement: Thrift Contract Extraction
The system SHALL parse `.thrift` files and extract service definitions, method signatures, and struct types.

#### Scenario: Thrift service extraction
- **WHEN** a `.thrift` file defines `service Calculator { i32 add(1: i32 a, 2: i32 b) }`
- **THEN** a Service node `Calculator` with Method `add` SHALL appear in the graph

### Requirement: Contract Matching
The system SHALL match gRPC/Thrift contract definitions with their implementations in supported languages (Go, Java, Python, Node).

#### Scenario: Proto-to-Go matching
- **WHEN** a `.proto` defines `GetUser` and a Go file implements `func (s *Server) GetUser(ctx context.Context, req *pb.GetUserRequest)`
- **THEN** an IMPLEMENTS edge SHALL link the Go method to the proto-defined RPC
