<?php
// Versão com debug detalhado
header('Content-Type: application/json');

// Log de entrada
$debugLog = [
    'timestamp' => date('Y-m-d H:i:s'),
    'post_data' => $_POST,
];

// Dados do cliente vindos do POST
$nome = $_POST['nome'] ?? 'Cliente Teste';
$cpf = $_POST['cpf'] ?? '10350593477'; // CPF do exemplo da API
$email = $_POST['email'] ?? 'teste@email.com';
$telefone = $_POST['telefone'] ?? '11989123121';

// Remover formatação
$cpf = preg_replace('/[^0-9]/', '', $cpf);
$telefone = preg_replace('/[^0-9]/', '', $telefone);

$debugLog['processed_data'] = [
    'nome' => $nome,
    'cpf' => $cpf,
    'email' => $email,
    'telefone' => $telefone
];

// Validações
if (strlen($cpf) !== 11) {
    echo json_encode([
        'success' => false,
        'error' => 'CPF inválido. Deve conter 11 dígitos.',
        'debug' => $debugLog
    ]);
    exit;
}

if (strlen($telefone) < 10) {
    echo json_encode([
        'success' => false,
        'error' => 'Telefone inválido. Mínimo 10 dígitos.',
        'debug' => $debugLog
    ]);
    exit;
}

// Valor fixo: R$ 46,80 = 4680 centavos
$valorCentavos = 4680;

// Dados da requisição (exatamente como o exemplo que funciona)
$data = [
    'customer' => [
        'document' => [
            'number' => $cpf
        ],
        'name' => $nome,
        'email' => $email,
        'phone' => $telefone
    ],
    'paymentMethod' => 'PIX',
    'items' => [
        [
            'title' => 'Taxa EMEX + Liberacao',
            'unitPrice' => $valorCentavos,
            'quantity' => 1,
            'tangible' => false
        ]
    ],
    'amount' => $valorCentavos
];

$debugLog['request_body'] = $data;

// Configuração do cURL
$ch = curl_init();

$headers = [
    'accept: application/json',
    'authorization: Basic c2tfbGl2ZV9FQktZcGwwWHBwb1JKU1Ixc0h2OW9pUXpPOHFyTVNDMnBVbnQwbFFCVUpWUFN4YjQ6YzQ0NThlNzgtMGRlMS00ZjVkLTg4MTQtOTA3ZWUxNjM4ZTcy',
    'content-type: application/json'
];

curl_setopt_array($ch, [
    CURLOPT_URL => 'https://api.ghostspaysv2.com/functions/v1/transactions',
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_POSTFIELDS => json_encode($data),
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_TIMEOUT => 30
]);

$debugLog['curl_options'] = [
    'url' => 'https://api.ghostspaysv2.com/functions/v1/transactions',
    'headers' => ['accept', 'authorization (hidden)', 'content-type']
];

// Executar requisição
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
$curlInfo = curl_getinfo($ch);

curl_close($ch);

$debugLog['curl_response'] = [
    'http_code' => $httpCode,
    'curl_error' => $curlError,
    'response_time' => $curlInfo['total_time'] ?? 0
];

// Verificar erros de conexão
if ($curlError) {
    echo json_encode([
        'success' => false,
        'error' => 'Erro na requisição: ' . $curlError,
        'debug' => $debugLog
    ]);
    exit;
}

// Decodificar resposta
$result = json_decode($response, true);
$debugLog['api_response'] = $result;

if (!$result) {
    echo json_encode([
        'success' => false,
        'error' => 'Erro ao decodificar resposta da API',
        'raw_response' => $response,
        'debug' => $debugLog
    ]);
    exit;
}

// Verificar status da transação
if (isset($result['status']) && $result['status'] === 'refused') {
    $errorMsg = 'Pagamento recusado';
    
    if (isset($result['refusedReason']['description'])) {
        $errorMsg = $result['refusedReason']['description'];
    }
    
    echo json_encode([
        'success' => false,
        'error' => $errorMsg,
        'refused' => true,
        'details' => $result['refusedReason'] ?? null,
        'full_response' => $result,
        'debug' => $debugLog
    ]);
    exit;
}

// Verificar se o QR Code foi gerado
if (empty($result['pix']['qrcode'])) {
    echo json_encode([
        'success' => false,
        'error' => 'QR Code PIX não foi gerado pela API',
        'status' => $result['status'] ?? 'unknown',
        'pix_data' => $result['pix'] ?? null,
        'full_response' => $result,
        'debug' => $debugLog
    ]);
    exit;
}

// Sucesso!
echo json_encode([
    'success' => true,
    'transactionId' => $result['id'] ?? null,
    'qrcode' => $result['pix']['qrcode'],
    'expirationDate' => $result['pix']['expirationDate'] ?? null,
    'amount' => $result['amount'] ?? $valorCentavos,
    'status' => $result['status'] ?? 'unknown',
    'debug' => $debugLog
]);
?>