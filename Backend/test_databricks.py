from databricks.sdk import WorkspaceClient

w = WorkspaceClient()

d = w.dbutils.fs.ls('/')

for f in d:
    print(f.path)
