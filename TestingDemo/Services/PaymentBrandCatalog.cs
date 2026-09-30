using TestingDemo.DTOs;

namespace TestingDemo.Services;

/// <summary>Monochrome payment-brand badges for the guest deposit picker.</summary>
public static class PaymentBrandCatalog
{
    public static readonly IReadOnlyList<PaymentBrandDto> Card =
    [
        Brand("visa", "Visa", "Card"),
        Brand("mastercard", "Mastercard", "Card"),
        Brand("jcb", "JCB", "Card"),
        Brand("amex", "American Express", "Card"),
    ];

    public static readonly IReadOnlyList<PaymentBrandDto> QrPh =
    [
        Brand("qrph", "QRPh", "QrPh"),
        Brand("gcash", "GCash", "QrPh"),
        Brand("maya", "Maya", "QrPh"),
        Brand("bpi", "BPI", "QrPh"),
        Brand("unionbank", "UnionBank", "QrPh"),
        Brand("landbank", "Landbank", "QrPh"),
        Brand("rcbc", "RCBC", "QrPh"),
        Brand("metrobank", "Metrobank", "QrPh"),
    ];

    private static PaymentBrandDto Brand(string key, string label, string channel)
        => new(key, label, $"/Images/payments/{key}.svg", channel);
}
