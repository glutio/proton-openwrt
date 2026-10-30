"""Independent Python integer/bcrypt reference for deterministic SRP test data."""
import base64
import hashlib
import json

import bcrypt


def expand(value):
    return b"".join(hashlib.sha512(value + bytes([i])).digest() for i in range(4))


def le(value):
    return value.to_bytes(256, "little")


def integer(value):
    return int.from_bytes(value, "little")


def b64(value):
    return base64.b64encode(value).decode()


modulus = base64.b64decode(
    "091HBWnHlR+qphOhmi9ZrTWMnPT/jXqWzUh7F8CShuXIfHe5srT4y3BoBi85N89ce"
    "Dhety3oVKoaS9sTQ6hVoRjjCulEuNQ5L6uN+9jG/f3/c3yVYjl6d9P1ktLsS21p3+2d"
    "QEAcNP0SQvMIdJPva1aBWsaoHKA3nzOp7pCIJHRw2Xx7T8AwzndW8r6KcNeZSLltj3F"
    "BIbWmKsaA8d3x+Db2D4M2Rngdf/eW2CQ39RlMvPdefMISs3jKSwduCJKCKbhYh6WSCj"
    "pgXrombuYIiMynfx38IibvSIURLOhXC9JKXY0k+bCPxZpt5iloe/11wK4ZSwuhYLEukD1"
    "ulvR1rw=="
)
n = integer(modulus)
salt = bytes(range(10))
b = 7
secret = b"A" * 31 + bytes([ord("A") | 128])
a = integer(secret)
A = pow(2, a, n)
result = {}
for password in ("test", "p" * 80, "caf\u00e9"):
    encoded_salt = base64.b64encode(salt + b"proton").translate(
        bytes.maketrans(
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
            b"./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
        )
    )[:22]
    hashed = bcrypt.hashpw(password.encode()[:72], b"$2y$10$" + encoded_salt)
    x = integer(expand(hashed + modulus))
    k = integer(expand(le(2) + modulus))
    v = pow(2, x, n)
    B = (k * v + pow(2, b, n)) % n
    u = integer(expand(le(A) + le(B)))
    client_shared = pow((B - k * v) % n, a + u * x, n)
    server_shared = pow((A * pow(v, u, n)) % n, b, n)
    assert client_shared == server_shared
    proof = expand(le(A) + le(B) + le(client_shared))
    result[password] = {
        "salt": b64(salt),
        "server": b64(le(B)),
        "ephemeral": b64(le(A)),
        "proof": b64(proof),
        "server_proof": b64(expand(le(A) + proof + le(server_shared))),
    }

print(json.dumps(result, ensure_ascii=True, indent=2))
