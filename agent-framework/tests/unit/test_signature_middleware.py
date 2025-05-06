"""Tests for Signature Validation Middleware."""

import json
import base58
import nacl.signing
import pytest
from prometheus_swarm.middleware.signature_validation import validate_signature


def generate_test_signature(payload, private_key=None):
    """Generate a test signature."""
    if private_key is None:
        private_key = nacl.signing.SigningKey.generate()
    
    signed_message = private_key.sign(json.dumps(payload).encode('utf-8'))
    return {
        'signed_message': base58.b58encode(signed_message).decode('utf-8'),
        'staking_key': base58.b58encode(private_key.verify_key.encode()).decode('utf-8')
    }


@validate_signature()
def example_function(signed_message=None, staking_key=None, validated_payload=None):
    """Example function for testing the middleware."""
    return {
        'signed_message': signed_message,
        'staking_key': staking_key,
        'validated_payload': validated_payload
    }


def test_signature_middleware_valid_signature():
    """Test middleware with a valid signature."""
    payload = {'user_id': 123, 'action': 'test'}
    signature_data = generate_test_signature(payload)

    result = example_function(**signature_data)
    
    assert result['validated_payload'] == payload


def test_signature_middleware_with_expected_values():
    """Test middleware with specific expected values."""
    @validate_signature(expected_values={'user_id': 123})
    def example_with_expectations(signed_message=None, staking_key=None, validated_payload=None):
        return validated_payload

    payload = {'user_id': 123, 'action': 'test'}
    signature_data = generate_test_signature(payload)

    result = example_with_expectations(**signature_data)
    assert result == payload


def test_signature_middleware_invalid_expected_values():
    """Test middleware with mismatched expected values."""
    @validate_signature(expected_values={'user_id': 456})
    def example_with_bad_expectations(signed_message=None, staking_key=None, validated_payload=None):
        return validated_payload

    payload = {'user_id': 123, 'action': 'test'}
    signature_data = generate_test_signature(payload)

    result = example_with_bad_expectations(**signature_data)
    assert result is None


def test_signature_middleware_invalid_signature():
    """Test middleware with an invalid signature."""
    @validate_signature(raise_on_error=True)
    def example_strict_function(signed_message=None, staking_key=None, validated_payload=None):
        return validated_payload

    # Use a different key to create an invalid signature
    payload = {'user_id': 123, 'action': 'test'}
    signature_data = generate_test_signature(payload)
    
    # Modify staking key to invalidate the signature
    signature_data['staking_key'] = base58.b58encode(nacl.signing.SigningKey.generate().verify_key.encode()).decode('utf-8')

    with pytest.raises(ValueError, match="Verification failed"):
        example_strict_function(**signature_data)


def test_signature_middleware_custom_key_source():
    """Test middleware with a custom staking key source."""
    def custom_key_source(**kwargs):
        return kwargs.get('custom_key', '')

    @validate_signature(staking_key_source=custom_key_source)
    def example_custom_key_function(signed_message=None, custom_key=None, validated_payload=None):
        return validated_payload

    payload = {'user_id': 123, 'action': 'test'}
    signature_data = generate_test_signature(payload)
    signature_data['custom_key'] = signature_data['staking_key']

    result = example_custom_key_function(**signature_data)
    assert result == payload