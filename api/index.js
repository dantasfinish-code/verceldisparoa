// Função auxiliar para formatar o CPF/CNPJ (remover caracteres não numéricos)
const cleanDocument = (doc) => doc ? doc.replace(/[^0-9]/g, '') : '';

// Função auxiliar para formatar o telefone (remover caracteres não numéricos)
const cleanPhone = (phone) => phone ? phone.replace(/[^0-9]/g, '') : '';

// Valor fixo em centavos (R$ 46,80)
const VALOR_CENTAVOS = 4680;

// IMPORTANTE: A chave JÁ está em Base64 no PHP original
// Não precisamos codificar novamente
const API_KEY = process.env.PIX_API_KEY || 'c2tfbGl2ZV9FQktZcGwwWHBwb1JKU1Ixc0h2OW9pUXpPOHFyTVNDMnBVbnQwbFFCVUpWUFN4YjQ6YzQ0NThlNzgtMGRlMS00ZjVkLTg4MTQtOTA3ZWUxNjM4ZTcy';
const API_URL = 'https://api.ghostspaysv2.com/functions/v1/transactions';

module.exports = async (req, res) => {
    // Habilita CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Trata requisição OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Apenas aceita POST
    if (req.method !== 'POST') {
        return res.status(400).json({
            success: false,
            error: 'Método não suportado. Use POST.'
        });
    }

    // Extrai os dados do corpo da requisição
    const { nome, cpf, email, telefone } = req.body;

    // Log para debug (opcional)
    console.log('Dados recebidos:', { nome, cpf, email, telefone });

    // Validação de dados
    const cleanCpf = cleanDocument(cpf);
    const cleanTelefone = cleanPhone(telefone);

    if (!cleanCpf || cleanCpf.length !== 11) {
        return res.status(400).json({ 
            success: false, 
            error: 'CPF inválido. Deve conter 11 dígitos.' 
        });
    }

    if (!cleanTelefone || cleanTelefone.length < 10) {
        return res.status(400).json({ 
            success: false, 
            error: 'Telefone inválido. Mínimo 10 dígitos.' 
        });
    }

    // Corpo da requisição para a API de PIX
    const requestBody = {
        customer: {
            document: {
                number: cleanCpf
            },
            name: nome || 'Cliente Sem Nome',
            email: email || 'cliente@email.com',
            phone: cleanTelefone
        },
        paymentMethod: 'PIX',
        items: [
            {
                title: 'Taxa EMEX + Liberacao',
                unitPrice: VALOR_CENTAVOS,
                quantity: 1,
                tangible: false
            }
        ],
        amount: VALOR_CENTAVOS
    };

    try {
        // A chave já está em Base64, então usamos diretamente
        const cleanApiKey = API_KEY.replace(/\s/g, '');
        
        console.log('Chamando API PIX...');

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'authorization': `Basic ${cleanApiKey}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const responseText = await response.text();
        console.log('Status HTTP:', response.status);
        console.log('Resposta da API:', responseText.substring(0, 200));

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('Erro ao parsear JSON:', responseText);
            return res.status(response.status).json({
                success: false,
                error: 'Erro de comunicação com a API de PIX.',
                details: `A API retornou: ${responseText.substring(0, 100)}`,
                http_status: response.status
            });
        }

        // Se a resposta HTTP não for OK
        if (!response.ok) {
            const errorMsg = data.message || data.error || `Erro HTTP ${response.status}`;
            return res.status(response.status).json({
                success: false,
                error: errorMsg,
                full_response: data
            });
        }

        // Verifica se o PIX foi recusado
        if (data.status === 'refused') {
            const refusedReason = data.refusedReason?.description || 'Pagamento recusado pela operadora.';
            return res.status(400).json({
                success: false,
                error: refusedReason,
                refused: true,
                details: data.refusedReason,
                full_response: data
            });
        }

        // Verifica se o QR Code foi gerado
        if (!data.pix || !data.pix.qrcode) {
            return res.status(400).json({
                success: false,
                error: 'QR Code PIX não foi gerado pela API.',
                status: data.status || 'unknown',
                full_response: data
            });
        }

        // Sucesso!
        return res.status(200).json({
            success: true,
            transactionId: data.id,
            qrcode: data.pix.qrcode,
            expirationDate: data.pix.expirationDate,
            amount: data.amount,
            status: data.status
        });

    } catch (error) {
        console.error('Erro na chamada da API:', error);
        return res.status(500).json({
            success: false,
            error: 'Erro interno ao processar a requisição PIX.',
            details: error.message
        });
    }
};
