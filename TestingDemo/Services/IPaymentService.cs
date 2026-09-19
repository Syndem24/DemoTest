using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface IPaymentService
{
    Task<PaymentRecordDto> RecordAsync(
        RecordPaymentRequest request,
        CancellationToken cancellationToken = default);

    Task<PaymentRecordDto> VoidAsync(
        int paymentId,
        VoidPaymentRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks a posted digital payment as manually verified by front-desk staff
    /// (receipt checked on the guest's e-wallet). Idempotent.
    /// </summary>
    Task<PaymentRecordDto> VerifyAsync(
        int paymentId,
        CancellationToken cancellationToken = default);

    Task<PagedPaymentsDto> GetPagedAsync(
        string? search,
        PaymentMethod? method,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default,
        DateOnly? paidOnManila = null,
        string? receivedBy = null);

    Task<IReadOnlyList<string>> GetCollectorsAsync(
        CancellationToken cancellationToken = default);

    Task<BookingPaymentSummaryDto?> GetBookingSummaryAsync(
        int bookingId,
        CancellationToken cancellationToken = default);

    Task<PaymentRecordDto?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default);

    Task<FlushPaymentsResult> FlushPaymentsAsync(
        string performedBy,
        FlushDateRange dateRange = default,
        bool clearAfterExport = true,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PaymentFlushLogDto>> GetPaymentFlushLogsAsync(
        CancellationToken cancellationToken = default);
}
