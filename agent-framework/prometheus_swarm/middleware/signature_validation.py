"""Signature Validation Middleware."""

from functools import wraps
from typing import Callable, Any, Dict, Optional

from prometheus_swarm.utils.signatures import verify_and_parse_signature
from prometheus_swarm.utils.logging import log_error


def validate_signature(
    staking_key_source: Callable[..., str] = lambda **kwargs: kwargs.get('staking_key', ''),
    expected_values: Optional[Dict[str, Any]] = None,
    raise_on_error: bool = False
) -> Callable:
    """
    A decorator middleware for signature validation.

    Args:
        staking_key_source (Callable): Function to extract the staking key from kwargs
        expected_values (dict, optional): Dictionary of key-value pairs to validate in payload
        raise_on_error (bool): Whether to raise an exception on validation failure

    Returns:
        Callable: Decorated function with signature validation
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Extract signed message from kwargs
            signed_message = kwargs.get('signed_message', '')
            
            # Get staking key using the provided source function
            staking_key = staking_key_source(*args, **kwargs)

            # Validate signature
            validation_result = verify_and_parse_signature(
                signed_message, 
                staking_key, 
                expected_values
            )

            # Check validation result
            if 'error' in validation_result:
                error_msg = validation_result['error']
                log_error(
                    Exception("Signature Validation Failed"), 
                    context=error_msg
                )
                
                if raise_on_error:
                    raise ValueError(error_msg)
                
                # Return error or None based on error handling preference
                return None

            # If validation succeeds, replace/add the validated data to kwargs
            validated_data = validation_result.get('data', {})
            kwargs['validated_payload'] = validated_data

            # Call the original function
            return func(*args, **kwargs)
        return wrapper
    return decorator