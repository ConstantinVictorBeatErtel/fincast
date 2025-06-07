# Financial Dashboard

A modern financial dashboard built with Next.js and Python, using the SimFin API to fetch and display financial data.

## Features

- Real-time financial data from SimFin API
- Interactive dashboard with key financial metrics
- Company performance visualization
- Responsive design for all devices

## Tech Stack

- Frontend: Next.js 14, TypeScript, Tailwind CSS
- Backend: Python, SimFin API
- Data Processing: Pandas, NumPy

## Setup

1. Clone the repository:
```bash
git clone <your-repo-url>
cd <your-repo-name>
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Install Node.js dependencies:
```bash
cd fincast
npm install
```

4. Set up your SimFin API key:
- Get your API key from [SimFin](https://simfin.com/)
- Update the API key in `scripts/fetch_company_data.py`

5. Fetch financial data:
```bash
python3 scripts/fetch_company_data.py
```

6. Start the development server:
```bash
cd fincast
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
.
├── fincast/                 # Next.js frontend application
│   ├── app/                # App router pages and components
│   ├── public/             # Static assets
│   └── package.json        # Frontend dependencies
├── scripts/                # Python scripts
│   └── fetch_company_data.py  # Data fetching script
├── data/                   # Generated financial data
└── requirements.txt        # Python dependencies
```

## License

MIT 