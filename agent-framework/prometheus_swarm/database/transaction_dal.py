"""Transaction Data Access Layer."""

import json
from typing import Optional, List, Dict, Any
from sqlmodel import Session, select
from uuid import uuid4
from datetime import datetime

from .database import get_session
from .models import Transaction


class TransactionDAL:
    """Data Access Layer for Transaction operations."""

    @staticmethod
    def create_transaction(
        transaction_type: str,
        amount: float,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        source: Optional[str] = None,
        destination: Optional[str] = None,
        status: str = "pending",
        request_id: Optional[str] = None
    ) -> Transaction:
        """
        Create a new transaction record.

        Args:
            transaction_type (str): Type of transaction
            amount (float): Transaction amount
            description (Optional[str]): Transaction description
            metadata (Optional[Dict[str, Any]]): Additional transaction details
            source (Optional[str]): Transaction source
            destination (Optional[str]): Transaction destination
            status (str): Transaction status
            request_id (Optional[str]): Request tracking ID

        Returns:
            Transaction: Created transaction record
        """
        if amount < 0:
            raise ValueError("Transaction amount must be non-negative")

        transaction = Transaction(
            transaction_type=transaction_type,
            amount=amount,
            description=description,
            metadata=json.dumps(metadata) if metadata else None,
            source=source,
            destination=destination,
            status=status,
            request_id=request_id or str(uuid4()),
            timestamp=datetime.utcnow()
        )

        with get_session() as session:
            session.add(transaction)
            session.commit()
            session.refresh(transaction)

        return transaction

    @staticmethod
    def get_transaction_by_id(transaction_id: int) -> Optional[Transaction]:
        """
        Retrieve a transaction by its ID.

        Args:
            transaction_id (int): Unique transaction identifier

        Returns:
            Optional[Transaction]: Transaction record or None if not found
        """
        with get_session() as session:
            transaction = session.get(Transaction, transaction_id)
            return transaction

    @staticmethod
    def get_transactions_by_type(
        transaction_type: str,
        limit: int = 100,
        offset: int = 0
    ) -> List[Transaction]:
        """
        Retrieve transactions by type.

        Args:
            transaction_type (str): Type of transaction to filter
            limit (int): Maximum number of transactions to return
            offset (int): Number of transactions to skip

        Returns:
            List[Transaction]: List of matching transactions
        """
        with get_session() as session:
            query = select(Transaction).where(
                Transaction.transaction_type == transaction_type
            ).limit(limit).offset(offset)
            result = session.execute(query)
            return list(result.scalars().all())

    @staticmethod
    def update_transaction_status(
        transaction_id: int,
        new_status: str
    ) -> Optional[Transaction]:
        """
        Update the status of a transaction.

        Args:
            transaction_id (int): Unique transaction identifier
            new_status (str): New status for the transaction

        Returns:
            Optional[Transaction]: Updated transaction or None if not found
        """
        valid_statuses = ["pending", "completed", "failed", "cancelled"]
        if new_status not in valid_statuses:
            raise ValueError(f"Invalid status. Must be one of {valid_statuses}")

        with get_session() as session:
            transaction = session.get(Transaction, transaction_id)
            if transaction:
                transaction.status = new_status
                session.commit()
                session.refresh(transaction)
            return transaction

    @staticmethod
    def delete_transaction(transaction_id: int) -> bool:
        """
        Delete a transaction record.

        Args:
            transaction_id (int): Unique transaction identifier

        Returns:
            bool: True if transaction was deleted, False otherwise
        """
        with get_session() as session:
            transaction = session.get(Transaction, transaction_id)
            if transaction:
                session.delete(transaction)
                session.commit()
                return True
            return False