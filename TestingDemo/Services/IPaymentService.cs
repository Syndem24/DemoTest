using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

/// <summary>
/// Stores e-payment receipt proof images for company records.
/// </summary>
public interface IPaymentReceiptStorage
{
    Task<string> SaveAsync(
        int bookingId,
        string receiptNumber,
        Stream content,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default);
}

public interface IPaymentService
{
    Task<PaymentRecordDto> RecordAsync(
        RecordPaymentRequest request,
        CancellationToken cancellationToken = default);

    Task<PaymentRecordDto> VoidAsync(
        int paymentId,
        VoidPaymentRequest request,
        CancellationToken cancellationToken = default);

    Task<PaymentRecordDto> UpdateReceiptDetailsAsync(
        int paymentId,
        UpdatePaymentReceiptDetailsRequest request,
        CancellationToken cancellationToken = default);

    Task<PagedPaymentsDto> GetPagedAsync(
        string? search,
        PaymentMethod? method,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    Task<BookingPaymentSummaryDto?> GetBookingSummaryAsync(
        int bookingId,
        CancellationToken cancellationToken = default);

    Task<PaymentRecordDto?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default);

    Task<FlushPaymentsResult> FlushPaymentsAsync(
        string performedBy,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PaymentFlushLogDto>> GetPaymentFlushLogsAsync(
        CancellationToken cancellationToken = default);
}
