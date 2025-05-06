"""Test Transaction Data Access Layer."""

import pytest
from sqlmodel import SQLModel, create_engine, Session
from prometheus_swarm.database.transaction_dal import TransactionDAL
from prometheus_swarm.database.models import Transaction
from prometheus_swarm.database.config import engine as database_engine
from prometheus_swarm.database.database import get_session


@pytest.fixture(scope="module")
def setup_db():
    """Create and configure a test database."""
    # In-memory SQLite database for testing
    test_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(test_engine)

    # Patch get_session to use test database
    def mock_get_session():
        return Session(test_engine)

    # Replace original function with mock
    import prometheus_swarm.database.database
    prometheus_swarm.database.database.get_session = mock_get_session

    yield
    SQLModel.metadata.drop_all(test_engine)


def test_create_transaction(setup_db):
    """Test creating a transaction."""
    transaction = TransactionDAL.create_transaction(
        transaction_type="deposit",
        amount=100.50,
        description="Test deposit",
        extra_info={"source": "bank"}
    )

    assert transaction is not None
    assert transaction.transaction_type == "deposit"
    assert transaction.amount == 100.50
    assert transaction.description == "Test deposit"
    assert transaction.status == "pending"
    assert transaction.extra_info == '{"source": "bank"}'


def test_create_transaction_negative_amount(setup_db):
    """Test creating a transaction with negative amount raises error."""
    with pytest.raises(ValueError, match="Transaction amount must be non-negative"):
        TransactionDAL.create_transaction(
            transaction_type="withdrawal",
            amount=-50
        )


def test_get_transaction_by_id(setup_db):
    """Test retrieving a transaction by ID."""
    created_transaction = TransactionDAL.create_transaction(
        transaction_type="transfer",
        amount=200
    )

    retrieved_transaction = TransactionDAL.get_transaction_by_id(created_transaction.id)

    assert retrieved_transaction is not None
    assert retrieved_transaction.id == created_transaction.id
    assert retrieved_transaction.amount == 200


def test_get_transactions_by_type(setup_db):
    """Test retrieving transactions by type."""
    # Create multiple transactions
    TransactionDAL.create_transaction(
        transaction_type="deposit",
        amount=100
    )
    TransactionDAL.create_transaction(
        transaction_type="deposit",
        amount=200
    )
    TransactionDAL.create_transaction(
        transaction_type="withdrawal",
        amount=50
    )

    deposits = TransactionDAL.get_transactions_by_type("deposit")
    assert len(deposits) == 2
    assert all(deposit.transaction_type == "deposit" for deposit in deposits)


def test_update_transaction_status(setup_db):
    """Test updating transaction status."""
    transaction = TransactionDAL.create_transaction(
        transaction_type="purchase",
        amount=75
    )

    # Update status to completed
    updated_transaction = TransactionDAL.update_transaction_status(
        transaction.id, "completed"
    )

    assert updated_transaction.status == "completed"


def test_update_transaction_status_invalid(setup_db):
    """Test updating transaction status with invalid status."""
    transaction = TransactionDAL.create_transaction(
        transaction_type="purchase",
        amount=75
    )

    with pytest.raises(ValueError, match="Invalid status"):
        TransactionDAL.update_transaction_status(transaction.id, "invalid_status")


def test_delete_transaction(setup_db):
    """Test deleting a transaction."""
    transaction = TransactionDAL.create_transaction(
        transaction_type="refund",
        amount=25
    )

    # Delete transaction
    result = TransactionDAL.delete_transaction(transaction.id)
    assert result is True

    # Verify transaction is deleted
    deleted_transaction = TransactionDAL.get_transaction_by_id(transaction.id)
    assert deleted_transaction is None