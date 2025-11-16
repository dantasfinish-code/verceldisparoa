<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

// Receber CPF via GET ou POST
$cpf = $_GET['cpf'] ?? $_POST['cpf'] ?? '';

// Remover formatação do CPF
$cpf = preg_replace('/[^0-9]/', '', $cpf);

// Validação
if (strlen($cpf) !== 11) {
    echo json_encode([
        'success' => false,
        'error' => 'CPF inválido. Deve conter 11 dígitos.'
    ]);
    exit;
}

// Consultar a nova API
$url = "https://skpt.fun/cpf/api.php?cpf=" . urlencode($cpf);

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_FOLLOWLOCATION => true
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

// Verificar erros de conexão
if ($curlError) {
    echo json_encode([
        'success' => false,
        'error' => 'Erro na requisição: ' . $curlError
    ]);
    exit;
}

// Decodificar resposta
$result = json_decode($response, true);

if (!$result) {
    echo json_encode([
        'success' => false,
        'error' => 'Erro ao decodificar resposta da API',
        'raw_response' => $response
    ]);
    exit;
}

// Verificar se a API retornou sucesso
if (isset($result['dados']) && isset($result['dados']['status']) && $result['dados']['status'] === 200) {
    $dados = $result['dados'];
    
    // Extrair os dados conforme a estrutura da nova API
    echo json_encode([
        'success' => true,
        'status' => 200,
        'nome' => $dados['nome'] ?? '',
        'mae' => $dados['mae'] ?? '',
        'nascimento' => $dados['nascimento'] ?? '',
        'sexo' => $dados['sexo'] ?? '',
        'cpf' => $dados['cpf'] ?? $cpf
    ]);
} else {
    echo json_encode([
        'success' => false,
        'error' => 'CPF não encontrado.',
        'response' => $result
    ]);
}
?>

