import simfin as sf
from simfin.names import *

# Set your API-key for downloading data.
# Replace YOUR_API_KEY with your actual API-key.
sf.set_api_key('392e2398-fac4-4eba-af9e-dcda63d71d30')

# Set the local directory where data-files are stored.
# The dir will be created if it does not already exist.
sf.set_data_dir('~/simfin_data/')

# Load the annual Income Statements for all companies in the US.
# The data is automatically downloaded if you don't have it already.
df = sf.load_income(variant='annual', market='us')

# Print all Revenue and Net Income for Microsoft (ticker MSFT).
print(df.loc['MSFT', [REVENUE, NET_INCOME]]) 